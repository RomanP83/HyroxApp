// ============================================================================
// Runs from the watch that the plan did not ask for.
//
// A run that was matched to a planned session is already in the load through
// its session log. Everything else the athlete ran still loads the body, so it
// enters the sRPE history here — with an effort estimated from heart rate,
// because nobody rated it. Pure and deterministic: same runs in, same load out.
// ============================================================================
import type { LoadEntry } from "./adaptive";
import {
  EXTERNAL_RUN_DEFAULT_RPE,
  EXTERNAL_RUN_DUPLICATE_DURATION_SHARE,
  EXTERNAL_RUN_MIN_TRUSTED_MAX_HR,
  EXTERNAL_RUN_RPE_BY_HR_SHARE,
} from "./constants";

export interface ExternalRun {
  /** Instant the run started. */
  at: string;
  /** Local calendar date of the run, YYYY-MM-DD. */
  date: string;
  duration_min: number;
  distance_km: number;
  avg_hr: number | null;
  /** True when the run was already logged against a planned session. */
  matched: boolean;
}

export interface LoggedRun {
  /** Local calendar date the run session was logged for, YYYY-MM-DD. */
  date: string;
  duration_min: number;
}

export interface UnplannedRun extends ExternalRun {
  rpe_estimated: number;
  srpe: number;
}

/** RPE from average heart rate against the highest heart rate seen. */
export function estimateRunRpe(avgHr: number | null, maxHrSeen: number | null): number {
  if (avgHr == null || avgHr <= 0 || maxHrSeen == null || maxHrSeen < EXTERNAL_RUN_MIN_TRUSTED_MAX_HR) {
    return EXTERNAL_RUN_DEFAULT_RPE;
  }
  const share = avgHr / maxHrSeen;
  return EXTERNAL_RUN_RPE_BY_HR_SHARE.find(([ceiling]) => share < ceiling)?.[1] ?? EXTERNAL_RUN_DEFAULT_RPE;
}

/**
 * The watch runs that are not yet in the load: not matched to a session, and
 * not the same run as a run session logged by hand (same day, similar length).
 * Each logged run can stand in for one watch run only.
 */
export function unplannedRuns(runs: ExternalRun[], logged: LoggedRun[], maxHrSeen: number | null): UnplannedRun[] {
  const pool = [...logged];
  const out: UnplannedRun[] = [];
  for (const run of [...runs].sort((a, b) => a.at.localeCompare(b.at))) {
    if (run.matched) continue;
    const twin = pool.findIndex(
      (l) =>
        l.date === run.date &&
        Math.abs(l.duration_min - run.duration_min) <=
          EXTERNAL_RUN_DUPLICATE_DURATION_SHARE * Math.max(l.duration_min, run.duration_min),
    );
    if (twin >= 0) {
      pool.splice(twin, 1);
      continue;
    }
    const rpe = estimateRunRpe(run.avg_hr, maxHrSeen);
    out.push({ ...run, rpe_estimated: rpe, srpe: Math.round(rpe * run.duration_min) });
  }
  return out;
}

export function unplannedRunLoad(runs: UnplannedRun[]): LoadEntry[] {
  return runs.map((r) => ({ at: r.at, srpe: r.srpe }));
}
