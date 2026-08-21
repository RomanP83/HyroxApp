import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { applyMicroForSession } from "@/lib/adaptiveRunner";
import { computeSessionFeedback, type FeedbackInput } from "@/lib/engine";
import { enrichFeedbackWithAI } from "@/lib/coachFeedback";
import { resetSessionLog } from "@/lib/resetSession";

// 1-Tap logging (PP5). Default is "completed as planned" — the engine writes
// planned values as actuals. Deviations arrive via rpe_actual / block_results.
const Body = z.object({
  completed_as_planned: z.boolean().default(true),
  rpe_actual: z.number().int().min(1).max(10).nullable().optional(),
  duration_actual_min: z.number().int().positive().nullable().optional(),
  block_results: z.array(z.record(z.any())).nullable().optional(),
  notes: z.string().max(2000).optional(),
  skip: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sessionId = params.id;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Load the session (RLS ensures the user owns it) to resolve planned values.
  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id, title, session_type, intensity_rpe_target, planned_duration_min")
    .eq("id", sessionId)
    .single();
  if (sErr || !session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.skip) {
    await supabase.from("sessions").update({ status: "skipped" }).eq("id", sessionId);
    return NextResponse.json({ ok: true, skipped: true });
  }

  // 1-tap default: planned values become the actuals.
  const rpe = body.completed_as_planned
    ? session.intensity_rpe_target
    : (body.rpe_actual ?? session.intensity_rpe_target);
  const duration = body.completed_as_planned
    ? session.planned_duration_min
    : (body.duration_actual_min ?? session.planned_duration_min);

  const { error: logErr } = await supabase.from("session_logs").upsert(
    {
      session_id: sessionId,
      completed_as_planned: body.completed_as_planned,
      rpe_actual: rpe,
      duration_actual_min: duration,
      block_results: body.completed_as_planned ? null : (body.block_results ?? null),
      notes: body.notes ?? null,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "session_id" },
  );
  if (logErr) return NextResponse.json({ error: "log_failed", detail: logErr.message }, { status: 500 });

  await supabase.from("sessions").update({ status: "done" }).eq("id", sessionId);

  // Fire Layer-1 micro-calibration (service role writes state + adjustments).
  const outcome = await applyMicroForSession(supabaseAdmin(), sessionId);

  // ── Trainingsfeedback: IST-SOLL + Erfüllungsindex + coach text ────────────
  // Planned pace target (if any) comes from the engine-rendered block overrides.
  const { data: paceBlock } = await supabase
    .from("session_blocks")
    .select("load_adjustments")
    .eq("session_id", sessionId)
    .not("load_adjustments->pace_sec_km", "is", null)
    .limit(1)
    .maybeSingle();
  const targetPace = (paceBlock?.load_adjustments as any)?.pace_sec_km as number | undefined;
  const actualPace = Array.isArray(body.block_results)
    ? (body.block_results.find((r) => typeof r?.pace_actual_sec_km === "number")
        ?.pace_actual_sec_km as number | undefined)
    : undefined;

  const feedbackInput: FeedbackInput = {
    sessionType: session.session_type,
    sessionTitle: session.title,
    rpeTarget: session.intensity_rpe_target,
    rpeActual: rpe,
    plannedDurationMin: session.planned_duration_min,
    actualDurationMin: duration,
    targetPaceSecKm: targetPace,
    actualPaceSecKm: actualPace,
  };
  const feedback = await enrichFeedbackWithAI(
    computeSessionFeedback(feedbackInput),
    feedbackInput,
  );
  await supabase.from("session_logs").update({ feedback }).eq("session_id", sessionId);

  return NextResponse.json({ ok: true, adaptation: outcome, feedback });
}

// ── Undo a logged day (mis-tap on Harder/Easier/Skip) ──────────────────────
// Deleting the log is not enough: the log was calibrated into athlete_state.
// resetSessionLog() restores the pre-log snapshot and replays every later log,
// so the plan ends up exactly where it would be had the day never been logged.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sessionId = params.id;

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Ownership check runs through RLS before the service-role client touches
  // engine-owned tables (athlete_state / plan_adjustments).
  const { data: session } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const outcome = await resetSessionLog(supabaseAdmin(), sessionId);
  if (!outcome) return NextResponse.json({ error: "reset_failed" }, { status: 500 });

  return NextResponse.json({ ok: true, reset: outcome });
}
