// ============================================================================
// Persistence: map the engine's GeneratedPlan tree into Supabase rows.
// Runs under the user's RLS-scoped client (they own the profile & plan).
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GeneratedPlan, WorkoutBlock } from "@/lib/engine";
import { ENGINE_VERSION } from "@/lib/engine";

/** Load the read-only workout_blocks library into engine shape. */
export async function loadLibrary(supabase: SupabaseClient): Promise<WorkoutBlock[]> {
  const { data, error } = await supabase.from("workout_blocks").select("*");
  if (error) throw new Error(`loadLibrary: ${error.message}`);
  return (data ?? []) as WorkoutBlock[];
}

export interface PersistMeta {
  profileId: string;
  raceDate: string; // ISO date
  raceId?: string | null;
  stripePaymentId?: string | null;
  status?: "active" | "paused";
}

/** Write plans -> phases -> weeks -> sessions -> session_blocks. Returns plan id. */
export async function persistPlan(
  supabase: SupabaseClient,
  meta: PersistMeta,
  plan: GeneratedPlan,
): Promise<string> {
  const { data: planRow, error: planErr } = await supabase
    .from("plans")
    .insert({
      profile_id: meta.profileId,
      race_id: meta.raceId ?? null,
      race_date: meta.raceDate,
      status: meta.status ?? "active",
      total_weeks: plan.total_weeks,
      engine_version: plan.engine_version || ENGINE_VERSION,
      stripe_payment_id: meta.stripePaymentId ?? null,
    })
    .select("id")
    .single();
  if (planErr || !planRow) throw new Error(`persist plan: ${planErr?.message}`);
  const planId = planRow.id as string;

  for (const phase of plan.phases) {
    const { data: phaseRow, error: phaseErr } = await supabase
      .from("plan_phases")
      .insert({
        plan_id: planId,
        phase_type: phase.phase_type,
        sort_order: phase.sort_order,
        start_week: phase.start_week,
        end_week: phase.end_week,
        focus_description: phase.focus_description,
        volume_multiplier: phase.volume_multiplier,
      })
      .select("id")
      .single();
    if (phaseErr || !phaseRow) throw new Error(`persist phase: ${phaseErr?.message}`);
    const phaseId = phaseRow.id as string;

    for (const week of phase.weeks) {
      const { data: weekRow, error: weekErr } = await supabase
        .from("plan_weeks")
        .insert({
          phase_id: phaseId,
          plan_id: planId,
          week_number: week.week_number,
          is_deload: week.is_deload,
          is_benchmark_week: week.is_benchmark_week,
          weekly_goal: week.weekly_goal,
          target_sessions: week.target_sessions,
          status: week.week_number === 1 ? "current" : "upcoming",
        })
        .select("id")
        .single();
      if (weekErr || !weekRow) throw new Error(`persist week: ${weekErr?.message}`);
      const weekId = weekRow.id as string;

      for (const s of week.sessions) {
        const { data: sessionRow, error: sErr } = await supabase
          .from("sessions")
          .insert({
            week_id: weekId,
            plan_id: planId,
            day_hint: s.day_hint,
            session_type: s.session_type,
            title: s.title,
            planned_duration_min: s.planned_duration_min,
            intensity_rpe_target: s.intensity_rpe_target,
            sort_order: s.sort_order,
          })
          .select("id")
          .single();
        if (sErr || !sessionRow) throw new Error(`persist session: ${sErr?.message}`);
        const sessionId = sessionRow.id as string;

        if (s.blocks.length) {
          const rows = s.blocks.map((b) => ({
            session_id: sessionId,
            block_id: b.block_id,
            sort_order: b.sort_order,
            load_adjustments: b.load_adjustments,
          }));
          const { error: sbErr } = await supabase.from("session_blocks").insert(rows);
          if (sbErr) throw new Error(`persist session_blocks: ${sbErr.message}`);
        }
      }
    }
  }

  return planId;
}
