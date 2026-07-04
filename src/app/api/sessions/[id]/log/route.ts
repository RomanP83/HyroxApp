import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { applyMicroForSession } from "@/lib/adaptiveRunner";

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
    .select("id, intensity_rpe_target, planned_duration_min")
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

  return NextResponse.json({ ok: true, adaptation: outcome });
}
