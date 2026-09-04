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
  rebaseFrom?: string;
  rebaseReason?: string;
}

/**
 * Write plans -> phases -> weeks -> sessions -> session_blocks via the
 * persist_plan Postgres function (migration 0004): one roundtrip, one
 * transaction — an interrupted generation can no longer leave an orphaned
 * partial plan behind (A4). The function also abandons the profile's previous
 * active/paused plans in the same transaction (A8) and enforces ownership
 * against auth.uid(). Returns the new plan id.
 */
export async function persistPlan(
  supabase: SupabaseClient,
  meta: PersistMeta,
  plan: GeneratedPlan,
): Promise<string> {
  const payload = {
    profile_id: meta.profileId,
    race_id: meta.raceId ?? null,
    race_date: meta.raceDate,
    status: meta.status ?? "active",
    stripe_payment_id: meta.stripePaymentId ?? null,
    total_weeks: plan.total_weeks,
    engine_version: plan.engine_version || ENGINE_VERSION,
    phases: plan.phases,
  };

  const { data, error } = meta.rebaseFrom
    ? await supabase.rpc("rebase_plan_once", {
        p_old: meta.rebaseFrom, p_payload: payload, p_reason: meta.rebaseReason ?? "Plan rebuilt.",
      })
    : await supabase.rpc("persist_plan", { p: payload });
  if (error || !data) throw new Error(`persist_plan: ${error?.message ?? "no plan id returned"}`);
  return data as string;
}
