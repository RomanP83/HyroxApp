// ============================================================================
// Goal-time prognosis.
//
// v1 modelled the race as "8 km at race pace, plus a per-division constant for
// the stations". That constant was 30 minutes for an open athlete, nudged ±8%
// by the mean station tier. It was cheap, and it was wrong by roughly ten
// minutes: an athlete running 4:23/km came out at 1:05, an elite finish time
// for a mid-pack runner.
//
// Worse, it was wrong in a way you could see. raceModel.ts gave the app a
// second, better model of the same race — per-station reference times by
// division and tier, a roxzone that scales with experience, and measured
// splits once a race has been logged — and /race decomposes the prognosis
// with it. Two models of one race, ten minutes apart, on the same screen.
//
// So there is one model now. This file supplies the running, raceModel.ts
// supplies everything else, and the benchmarks nudge the piece each one
// actually speaks to.
// ============================================================================

import {
  RACE_RUNS,
  roxzoneSeconds,
  stationCosts,
} from "./raceModel";
import type { AthleteProfile, AthleteState } from "./types";

export interface BenchmarkSample {
  slug: string; // benchmark_definitions.slug
  value: number; // metric value (sec, reps, or m)
}

/** A 1 km time trial run fresh, as a fraction of the pace held under fatigue. */
const TIME_TRIAL_TO_RACE_PACE = 1.12;

/** How far the 1 km test is trusted against the calibrated race zone. */
const TIME_TRIAL_WEIGHT = 0.3;

/** Wall-ball reps in two minutes: the window, and what it is worth in seconds. */
const WALL_BALL_REFERENCE_REPS = 65;
const WALL_BALL_REP_WINDOW = 25;
const WALL_BALL_MAX_SECONDS = 60;

/**
 * Predict total Hyrox finish time (seconds).
 *
 * Eight kilometres at race pace, plus what the eight stations and the roxzone
 * cost this athlete — the same numbers the pacing sheet on /race lays out, so
 * the estimate and its own decomposition cannot disagree.
 */
export function predictRaceTime(
  profile: AthleteProfile,
  state: AthleteState,
  benchmarks: BenchmarkSample[] = [],
): number {
  const racePace = state.pace_zones.race_sec_km || 300; // sec/km fallback 5:00
  let runningSeconds = racePace * RACE_RUNS;

  // A fast 1 km says the race-pace zone is conservative — but a time trial is
  // run fresh and the race is not, so it only leans on the calibrated zone.
  const run1k = benchmarks.find((b) => b.slug === "run_1k");
  if (run1k) {
    const impliedRacePace = run1k.value * TIME_TRIAL_TO_RACE_PACE;
    runningSeconds += (impliedRacePace - racePace) * RACE_RUNS * TIME_TRIAL_WEIGHT;
  }

  // Stations: measured where a race has been logged, estimated from the tier
  // until then. stationCosts is what /race draws its bars from.
  const costs = stationCosts({
    division: profile.division,
    tiers: state.station_tiers,
    measured: state.measured_station_seconds,
  });
  let stationSeconds = 0;
  for (const cost of costs) {
    let seconds = cost.seconds;
    // The wall-ball test speaks to exactly one station, so it moves that one
    // rather than the whole race. A measured race split is the better number
    // and keeps its place: the test exists to sharpen an estimate, not to
    // argue with something that actually happened.
    if (cost.station === "wall_balls" && !cost.measured) {
      const wallBalls = benchmarks.find((b) => b.slug === "wall_balls");
      if (wallBalls) {
        const norm = Math.max(
          -1,
          Math.min(1, (wallBalls.value - WALL_BALL_REFERENCE_REPS) / WALL_BALL_REP_WINDOW),
        );
        seconds = Math.max(1, seconds - norm * WALL_BALL_MAX_SECONDS);
      }
    }
    stationSeconds += seconds;
  }

  return Math.round(runningSeconds + stationSeconds + roxzoneSeconds(profile.experience_level));
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
