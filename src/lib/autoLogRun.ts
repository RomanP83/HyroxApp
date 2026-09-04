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
import {
  dateInTrainingZone,
  dayHintForDate,
  planWeekNumber,
  syncPlanWeekStatuses,
} from "@/lib/planClock";

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
export function slotForRun(
  startedAt?: string,
  timeZone = process.env.APP_TIME_ZONE || "Europe/Berlin",
): "am" | "pm" | null {
  if (!startedAt) return null;
  const at = new Date(startedAt);
  if (Number.isNaN(at.getTime())) return null;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(at),
  );
  return hour < 12 ? "am" : "pm";
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
  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("id, generated_at, total_weeks")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planError) throw new Error("Run plan lookup failed");
  if (!plan) return null;
  const started = run.startedAt ? new Date(run.startedAt).getTime() : NaN;
  if (!Number.isFinite(started) || started < new Date(plan.generated_at).getTime() || started > Date.now()) {
    return null;
  }
  const today = dateInTrainingZone();
  const activityDate = run.startedAt
    ? dateInTrainingZone(new Date(run.startedAt))
    : today;
  const currentWeekNumber = await syncPlanWeekStatuses(admin, plan, today);
  if (planWeekNumber(plan.generated_at, plan.total_weeks, activityDate) !== currentWeekNumber) {
    return null;
  }

  const { data: week, error: weekError } = await admin
    .from("plan_weeks")
    .select("id")
    .eq("plan_id", plan.id)
    .eq("status", "current")
    .maybeSingle();
  if (weekError) throw new Error("Run week lookup failed");
  if (!week) return null;

  const activityDayHint = dayHintForDate(activityDate);
  const { data: candidates, error: candidatesError } = await admin
    .from("sessions")
    .select("id, day_hint, day_slot, session_type, intensity_rpe_target")
    .eq("week_id", week.id)
    .in("session_type", RUN_SESSION_TYPES)
    .in("status", ["planned", "moved"]);
  if (candidatesError) throw new Error("Run session lookup failed");
  if (!candidates?.length) return null;

  // On a double day both halves can hold a run. Prefer the one whose slot
  // matches when the run actually started. Never fall back to another half:
  // a redelivery must not consume the second run of a double day.
  const sameDay = candidates.filter((s) => s.day_hint === activityDayHint);
  const runSlot = slotForRun(run.startedAt);
  const session = sameDay.find((s) => (s.day_slot ?? "am") === runSlot);
  // A webhook arriving late must never consume an unrelated run merely
  // because it is the earliest remaining one in the week.
  if (!session) return null;

  const { data, error } = await admin.rpc("record_session_completion", {
    p_session: session.id,
    p_completed_as_planned: false,
    p_rpe: session.intensity_rpe_target,
    p_duration: Math.max(1, Math.round(run.durationMin)),
    p_block_results: [{ pace_actual_sec_km: run.paceSecKm, distance_actual_m: Math.round(run.distanceM) }],
    p_notes: `Auto-logged from ${run.source}: ${run.name ?? "Run"}`,
    p_completed_at: run.startedAt,
  });
  if (error) throw new Error(`auto-log: ${error.message}`);
  if (!data?.created) return null;
  await applyMicroForSession(admin, session.id);
  return session.id;
}
