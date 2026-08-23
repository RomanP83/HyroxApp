// ============================================================================
// What the athlete has ACTUALLY been running, week by week.
//
// The volume target is a plan; this is the reality it has to grow out of. Real
// distance wins when a watch reported it (Strava/Garmin write distance into
// block_results), otherwise the logged minutes are converted with the pace zone
// the session was run in — the same arithmetic the plan uses forward.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { plannedDistanceKm, runSpec, type PaceZones, type SessionType } from "@/lib/engine";

const WEEK_MS = 7 * 86_400_000;

interface LogRow {
  completed_at: string;
  duration_actual_min: number | null;
  block_results: unknown;
  sessions: { session_type: SessionType } | { session_type: SessionType }[] | null;
}

/** Distance a single log carries: measured if we have it, derived if not. */
export function loggedDistanceKm(
  sessionType: SessionType,
  durationMin: number | null,
  blockResults: unknown,
  zones: PaceZones,
): number {
  if (!runSpec(sessionType)) return 0;
  if (Array.isArray(blockResults)) {
    const measured = blockResults.find(
      (r) => typeof (r as { distance_actual_m?: unknown })?.distance_actual_m === "number",
    ) as { distance_actual_m: number } | undefined;
    if (measured) return Math.round((measured.distance_actual_m / 1000) * 10) / 10;
  }
  return durationMin ? plannedDistanceKm(sessionType, durationMin, zones) : 0;
}

/**
 * Kilometres run in each of the last four weeks, most recent first. Weeks with
 * no logged running are dropped rather than counted as zero — a week nobody
 * logged is not evidence of a week nobody ran.
 */
export async function recentWeeklyRunKm(
  supabase: SupabaseClient,
  zones: PaceZones,
  weeks = 4,
): Promise<number[]> {
  const since = new Date(Date.now() - weeks * WEEK_MS).toISOString();
  // RLS scopes session_logs to the caller's own sessions.
  const { data } = await supabase
    .from("session_logs")
    .select("completed_at, duration_actual_min, block_results, sessions!inner(session_type)")
    .gte("completed_at", since)
    .order("completed_at", { ascending: false });

  const buckets = new Array(weeks).fill(0);
  const seen = new Array(weeks).fill(false);
  const now = Date.now();

  for (const row of (data ?? []) as unknown as LogRow[]) {
    const session = Array.isArray(row.sessions) ? row.sessions[0] : row.sessions;
    if (!session) continue;
    const km = loggedDistanceKm(session.session_type, row.duration_actual_min, row.block_results, zones);
    if (km <= 0) continue;
    const index = Math.floor((now - new Date(row.completed_at).getTime()) / WEEK_MS);
    if (index < 0 || index >= weeks) continue;
    buckets[index] += km;
    seen[index] = true;
  }

  return buckets
    .map((km, i) => (seen[i] ? Math.round(km * 10) / 10 : null))
    .filter((km): km is number => km != null);
}
