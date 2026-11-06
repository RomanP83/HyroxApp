import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { applyMicroForSession } from "@/lib/adaptiveRunner";
import { computeSessionFeedback, type FeedbackInput } from "@/lib/engine";
import { enrichFeedbackWithAI } from "@/lib/coachFeedback";
import { resetSessionLog } from "@/lib/resetSession";
import { refreshStrengthSuggestions } from "@/lib/strength/record";

// 1-Tap logging (PP5). Default is "completed as planned" — the engine writes
// planned values as actuals. Deviations arrive via rpe_actual / block_results.
const Body = z.object({
  completed_as_planned: z.boolean().default(true),
  rpe_actual: z.number().int().min(1).max(10).nullable().optional(),
  duration_actual_min: z.number().int().positive().nullable().optional(),
  block_results: z.array(z.record(z.any())).nullable().optional(),
  notes: z.string().max(2000).optional(),
  skip: z.boolean().optional(),
  /**
   * Per-set detail for a strength session (reps + kg). Optional: the 1-tap log
   * still works exactly as before, this just carries the numbers when the
   * athlete filled them in.
   */
  strength_sets: z
    .array(
      z.object({
        exercise_id: z.string().uuid().nullable().optional(),
        exercise_name: z.string().min(1).max(120),
        set_number: z.number().int().min(1).max(12),
        reps: z.number().int().min(0).max(200).nullable().optional(),
        load_kg: z.number().min(0).max(1000).nullable().optional(),
      }),
    )
    .max(60)
    .optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = (await params).id;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = await supabaseServer();
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
    const { error } = await supabase.from("sessions").update({ status: "skipped" })
      .eq("id", sessionId).in("status", ["planned", "moved", "skipped"]);
    if (error) return NextResponse.json({ error: "skip_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, skipped: true });
  }

  // 1-tap default: planned values become the actuals.
  const rpe = body.completed_as_planned
    ? session.intensity_rpe_target
    : (body.rpe_actual ?? session.intensity_rpe_target);
  const duration = body.completed_as_planned
    ? session.planned_duration_min
    : (body.duration_actual_min ?? session.planned_duration_min);

  const blockResults = body.strength_sets?.length
    ? body.strength_sets.map((s) => ({
        exercise: s.exercise_name,
        set_number: s.set_number,
        reps_actual: s.reps ?? null,
        load_actual: s.load_kg ?? null,
      }))
    : body.completed_as_planned
      ? null
      : (body.block_results ?? null);

  const { data: writeResult, error: logErr } = await supabase.rpc("record_session_completion", {
    p_session: sessionId,
    p_completed_as_planned: body.completed_as_planned,
    p_rpe: rpe,
    p_duration: duration,
    p_block_results: blockResults,
    p_notes: body.notes ?? null,
    p_strength_sets: body.strength_sets ?? [],
  });
  if (logErr) return NextResponse.json({ error: "log_failed", detail: logErr.message }, { status: 500 });

  if (!writeResult?.created) {
    const { data: existing } = await supabase
      .from("session_logs")
      .select("feedback")
      .eq("session_id", sessionId)
      .maybeSingle();
    return NextResponse.json({ ok: true, already_logged: true, feedback: existing?.feedback ?? null });
  }

  const exerciseIds = (body.strength_sets ?? [])
    .map((set) => set.exercise_id)
    .filter((id): id is string => Boolean(id));
  // Optional suggestions must not prevent calibration after a successful log.
  const suggestions = await refreshStrengthSuggestions(supabase, exerciseIds).catch(() => []);
  const strength = body.strength_sets?.length
    ? { sets: Number(writeResult.strength_sets ?? 0), suggestions }
    : null;

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

  return NextResponse.json({ ok: true, adaptation: outcome, feedback, strength });
}

// ── Undo a logged day (mis-tap on Harder/Easier/Skip) ──────────────────────
// Deleting the log is not enough: the log was calibrated into athlete_state.
// resetSessionLog() restores the pre-log snapshot and replays every later log,
// so the plan ends up exactly where it would be had the day never been logged.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessionId = (await params).id;

  const supabase = await supabaseServer();
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
