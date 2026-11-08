// ============================================================================
// Garmin runs → training load and auto-logging.
//
// Reads the imported Garmin runs (migration 0036/0037) and hands them to the
// pure engine functions in engine/externalRuns.ts. Every place that builds a
// load history — logging a session, the nightly run, the Progress chart —
// adds the same unplanned-run entries, so the numbers cannot disagree.
// A database without the Garmin tables gets an empty list, never an error.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { unplannedRuns, type ExternalRun, type LoggedRun, type UnplannedRun } from "@/lib/engine/externalRuns";
import { autoLogRun } from "@/lib/autoLogRun";
import { dateInTrainingZone } from "@/lib/planClock";
import { runDashboard } from "@/lib/garminRuns";

const RUN_SESSION_TYPES = ["run_easy", "run_intervals", "compromised_run"];

/**
 * A watch's local wall time ("2026-11-07T16:06:47") as an instant, read in
 * the training time zone. Two passes settle the offset across DST changes.
 */
export function localWallTimeToIso(
  local: string,
  timeZone = process.env.APP_TIME_ZONE || "Europe/Berlin",
): string {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(local).toISOString();
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(instant));
    const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - instant;
  };
  let instant = wall - offsetAt(wall);
  instant = wall - offsetAt(instant);
  return new Date(instant).toISOString();
}

interface GarminRunRow {
  activity_id: number | string;
  session_id: string | null;
  name: string | null;
  start_local: string;
  distance_m: number | string;
  duration_s: number | string;
  avg_hr: number | null;
}

/** Highest heart rate the watch has recorded on any imported run. */
async function maxHrSeen(client: SupabaseClient, profileId: string): Promise<number | null> {
  const { data, error } = await client
    .from("garmin_runs")
    .select("max_hr")
    .eq("profile_id", profileId)
    .not("max_hr", "is", null)
    .order("max_hr", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;
  return Number(data[0].max_hr);
}

export interface GarminLoadContext {
  unplanned: (UnplannedRun & { name: string | null })[];
  maxHr: number | null;
}

/**
 * The Garmin runs since `sinceIso` that are not yet in the load, with their
 * estimated effort. A run logged against a session, or the same run as a run
 * session logged by hand, is left out.
 */
export async function garminLoadContext(
  client: SupabaseClient,
  profileId: string,
  planId: string | null,
  sinceIso: string,
): Promise<GarminLoadContext> {
  const sinceDate = dateInTrainingZone(new Date(sinceIso));
  const { data: rows, error } = await client
    .from("garmin_runs")
    .select("activity_id, session_id, name, start_local, distance_m, duration_s, avg_hr")
    .eq("profile_id", profileId)
    .gte("start_local", sinceDate)
    .order("start_local", { ascending: true });
  if (error || !rows?.length) return { unplanned: [], maxHr: null };
  const runs = rows as GarminRunRow[];

  const matchedSessions = new Set(runs.map((r) => r.session_id).filter(Boolean) as string[]);
  let logged: LoggedRun[] = [];
  if (planId) {
    const { data: logs } = await client
      .from("session_logs")
      .select("session_id, completed_at, duration_actual_min, sessions!inner(plan_id, session_type)")
      .eq("sessions.plan_id", planId)
      .in("sessions.session_type", RUN_SESSION_TYPES)
      .gte("completed_at", sinceIso);
    logged = ((logs ?? []) as { session_id: string; completed_at: string; duration_actual_min: number | null }[])
      .filter((l) => !matchedSessions.has(l.session_id))
      .map((l) => ({
        date: dateInTrainingZone(new Date(l.completed_at)),
        duration_min: Number(l.duration_actual_min ?? 0),
      }));
  }

  const maxHr = await maxHrSeen(client, profileId);
  const external: (ExternalRun & { name: string | null })[] = runs.map((r) => ({
    at: localWallTimeToIso(r.start_local),
    date: r.start_local.slice(0, 10),
    duration_min: Number(r.duration_s) / 60,
    distance_km: Number(r.distance_m) / 1000,
    avg_hr: r.avg_hr,
    matched: r.session_id != null,
    name: r.name,
  }));
  const names = new Map(external.map((r) => [r.at, r.name]));
  return {
    unplanned: unplannedRuns(external, logged, maxHr).map((u) => ({ ...u, name: names.get(u.at) ?? null })),
    maxHr,
  };
}

/**
 * Hand every not-yet-matched Garmin run of the last eight days to the shared
 * auto-log path (the same one Strava and the Garmin webhook use). A run that
 * finds its planned session is logged with its real pace and remembered on
 * the run row, so it is never offered again.
 */
export async function autoLogGarminRuns(admin: SupabaseClient, profileId: string): Promise<number> {
  const since = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
  const { data: rows, error } = await admin
    .from("garmin_runs")
    .select("activity_id, session_id, name, start_local, distance_m, duration_s, avg_hr")
    .eq("profile_id", profileId)
    .is("session_id", null)
    .gte("start_local", since)
    .order("start_local", { ascending: true });
  if (error) throw new Error(`garmin runs lookup: ${error.message}`);

  let logged = 0;
  for (const r of (rows ?? []) as GarminRunRow[]) {
    const distanceM = Number(r.distance_m);
    const durationS = Number(r.duration_s);
    const sessionId = await autoLogRun(admin, profileId, {
      paceSecKm: Math.round(durationS / (distanceM / 1000)),
      durationMin: durationS / 60,
      distanceM,
      source: "Garmin",
      name: r.name ?? undefined,
      startedAt: localWallTimeToIso(r.start_local),
    });
    if (!sessionId) continue;
    const { error: linkError } = await admin
      .from("garmin_runs")
      .update({ session_id: sessionId })
      .eq("profile_id", profileId)
      .eq("activity_id", r.activity_id);
    if (linkError) throw new Error(`garmin run link: ${linkError.message}`);
    logged++;
  }
  return logged;
}

// ── Facts for the AI coach ──────────────────────────────────────────────────

export interface GarminCoachFacts {
  /** Last six calendar weeks, oldest first; the last one is still running. */
  weekly: { week_start: string; km: number; runs: number; pace_sec_km: number | null }[];
  avg_km_last_4_weeks: number;
  avg_km_4_weeks_before: number;
  pace_last_4_weeks_sec_km: number | null;
  pace_4_weeks_before_sec_km: number | null;
  vo2max_latest: number | null;
  vo2max_about_4_weeks_ago: number | null;
  race_predictions_sec: { "5k": number | null; "10k": number | null; half: number | null; marathon: number | null } | null;
  /** Runs no planned session accounts for; already counted in acwr. */
  unplanned_runs_recent: { date: string; km: number; min: number; avg_hr: number | null; rpe_estimated: number }[];
}

/** Garmin running facts for the coach; null when no Garmin runs exist. */
export async function garminCoachFacts(
  admin: SupabaseClient,
  profileId: string,
  planId: string,
  now: Date,
  historyDays: number,
): Promise<GarminCoachFacts | null> {
  const since = new Date(now.getTime() - 70 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: runs, error }, { data: fitness }] = await Promise.all([
    admin
      .from("garmin_runs")
      .select("activity_id, name, activity_type, start_local, distance_m, duration_s, avg_hr")
      .eq("profile_id", profileId)
      .gte("start_local", since)
      .order("start_local", { ascending: true }),
    admin
      .from("garmin_fitness")
      .select("on_date, vo2max, pred_5k_sec, pred_10k_sec, pred_half_sec, pred_marathon_sec")
      .eq("profile_id", profileId)
      .gte("on_date", since)
      .order("on_date", { ascending: true }),
  ]);
  if (error || !runs?.length) return null;

  const d = runDashboard(runs as never, dateInTrainingZone(now), 6);
  const fit = (fitness ?? []) as {
    on_date: string;
    vo2max: number | string | null;
    pred_5k_sec: number | null;
    pred_10k_sec: number | null;
    pred_half_sec: number | null;
    pred_marathon_sec: number | null;
  }[];
  const vo2 = fit.filter((f) => f.vo2max != null);
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86_400_000).toISOString().slice(0, 10);
  const vo2Then = [...vo2].reverse().find((f) => f.on_date <= fourWeeksAgo) ?? null;
  const pred = [...fit].reverse().find((f) => f.pred_5k_sec ?? f.pred_10k_sec ?? f.pred_half_sec ?? f.pred_marathon_sec);
  const load = await garminLoadContext(
    admin,
    profileId,
    planId,
    new Date(now.getTime() - historyDays * 86_400_000).toISOString(),
  );

  return {
    weekly: d.weeks.map((w) => ({ week_start: w.monday, km: w.km, runs: w.runs, pace_sec_km: w.paceSecKm })),
    avg_km_last_4_weeks: d.avgKm4,
    avg_km_4_weeks_before: d.avgKmPrev4,
    pace_last_4_weeks_sec_km: d.pace4,
    pace_4_weeks_before_sec_km: d.pacePrev4,
    vo2max_latest: vo2.length ? Number(vo2[vo2.length - 1].vo2max) : null,
    vo2max_about_4_weeks_ago: vo2Then ? Number(vo2Then.vo2max) : null,
    race_predictions_sec: pred
      ? { "5k": pred.pred_5k_sec, "10k": pred.pred_10k_sec, half: pred.pred_half_sec, marathon: pred.pred_marathon_sec }
      : null,
    unplanned_runs_recent: load.unplanned.map((u) => ({
      date: u.date,
      km: Math.round(u.distance_km * 10) / 10,
      min: Math.round(u.duration_min),
      avg_hr: u.avg_hr,
      rpe_estimated: u.rpe_estimated,
    })),
  };
}
