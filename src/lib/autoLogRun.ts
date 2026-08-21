// ============================================================================
// Shared auto-logging for wearable/run integrations (Strava, Garmin).
// One matching + logging path: a finished outdoor run is assigned to the
// best-fitting planned run session of the current week (today first) and
// logged with its real pace in block_results — which feeds the EXISTING
// pace-zone calibration in the adaptive engine. Integrations only differ in
// how the run reaches us (OAuth flavor + webhook shape), never in what
// happens to it.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyMicroForSession } from "@/lib/adaptiveRunner";

const RUN_SESSION_TYPES = ["run_easy", "run_intervals", "compromised_run"];

/** Pace in sec/km from raw meters + seconds; null when degenerate. */
export function paceSecPerKm(distanceM: number, movingTimeS: number): number | null {
  if (!distanceM || distanceM < 400 || !movingTimeS) return null;
  return Math.round(movingTimeS / (distanceM / 1000));
}

export interface RunSample {
  paceSecKm: number;
  durationMin: number;
  distanceM: number;
  /** e.g. "Strava" / "Garmin" — shows up in the log note. */
  source: string;
  name?: string;
  /** ISO timestamp the run started, when the provider tells us. */
  startedAt?: string;
}

/** Which half of the day a run belongs to. Before noon is the morning. */
export function slotForRun(startedAt?: string): "am" | "pm" | null {
  if (!startedAt) return null;
  const at = new Date(startedAt);
  if (Number.isNaN(at.getTime())) return null;
  return at.getUTCHours() < 12 ? "am" : "pm";
}

/**
 * Match the run to a planned session of the athlete's current week and log it.
 * Returns the logged session id, or null when nothing matched.
 */
export async function autoLogRun(
  admin: SupabaseClient,
  profileId: string,
  run: RunSample,
): Promise<string | null> {
  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return null;

  const { data: week } = await admin
    .from("plan_weeks")
    .select("id")
    .eq("plan_id", plan.id)
    .eq("status", "current")
    .maybeSingle();
  if (!week) return null;

  const todayHint = ((new Date().getUTCDay() + 6) % 7) + 1;
  const { data: candidates } = await admin
    .from("sessions")
    .select("id, day_hint, day_slot, session_type, intensity_rpe_target")
    .eq("week_id", week.id)
    .in("session_type", RUN_SESSION_TYPES)
    .in("status", ["planned", "moved"]);
  if (!candidates?.length) return null;

  // On a double day both halves can hold a run. Prefer the one whose slot
  // matches when the run actually started, then any session of today, then the
  // earliest planned run of the week.
  const today = candidates.filter((s) => s.day_hint === todayHint);
  const runSlot = slotForRun(run.startedAt);
  const session =
    (runSlot ? today.find((s) => (s.day_slot ?? "am") === runSlot) : undefined) ??
    today.sort((a, b) => ((a.day_slot ?? "am") === "am" ? -1 : 1))[0] ??
    [...candidates].sort((a, b) => a.day_hint - b.day_hint)[0];

  const { error } = await admin.from("session_logs").upsert(
    {
      session_id: session.id,
      completed_as_planned: false,
      rpe_actual: session.intensity_rpe_target, // effort unknown — pace carries the signal
      duration_actual_min: Math.max(1, Math.round(run.durationMin)),
      block_results: [
        { pace_actual_sec_km: run.paceSecKm, distance_actual_m: Math.round(run.distanceM) },
      ],
      notes: `Auto-logged from ${run.source}: ${run.name ?? "Run"}`,
      completed_at: new Date().toISOString(),
    },
    { onConflict: "session_id" },
  );
  if (error) return null;

  await admin.from("sessions").update({ status: "done" }).eq("id", session.id);
  await applyMicroForSession(admin, session.id);
  return session.id;
}
