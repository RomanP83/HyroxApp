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
// So there is one model now, and it lives in raceModel.ts — benchmark
// corrections included, because a correction only one of two consumers applies
// is just a second model wearing a smaller hat. What is left here is the sum,
// and the question the sum exists to answer: is this athlete on course for the
// time they are actually training for.
// ============================================================================

import {
  racePaceWithBenchmarks,
  RACE_RUNS,
  roxzoneSeconds,
  stationCosts,
  type StationCost,
} from "./raceModel";
import type { AthleteProfile, AthleteState, BenchmarkSample } from "./types";

export type { BenchmarkSample };

/**
 * Predict total Hyrox finish time (seconds).
 *
 * Eight kilometres at race pace, plus what the eight stations and the roxzone
 * cost this athlete — the same numbers, through the same functions, that the
 * pacing sheet on /race lays out. The benchmark corrections live in raceModel
 * so that both sides apply them: an estimate and its own decomposition are not
 * allowed to disagree.
 */
export function predictRaceTime(
  profile: AthleteProfile,
  state: AthleteState,
  benchmarks: BenchmarkSample[] = [],
): number {
  const racePace = racePaceWithBenchmarks(state.pace_zones.race_sec_km || 300, benchmarks);
  const costs = stationCosts({
    division: profile.division,
    tiers: state.station_tiers,
    measured: state.measured_station_seconds,
    benchmarks,
  });
  const stationSeconds = costs.reduce((n, c) => n + c.seconds, 0);
  return Math.round(
    racePace * RACE_RUNS + stationSeconds + roxzoneSeconds(profile.experience_level),
  );
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

// ── Am I on course? ─────────────────────────────────────────────────────────

export interface GoalCheck {
  /** What the athlete is training for. */
  goal_seconds: number;
  /** What the model says they will run. */
  predicted_seconds: number;
  /** Positive: this far short of the goal. Negative: this far inside it. */
  delta_seconds: number;
  on_course: boolean;
  /**
   * Of the time still to find, how much the stations can give — every station
   * lifted to the level of an athlete who owns it — and how much would then
   * have to come out of the legs.
   */
  station_gap_seconds: number;
  running_gap_seconds: number;
  /** The stations holding the most of it, worst first. */
  worst: StationCost[];
  /**
   * The pace the legs would have to hold if every station were already at its
   * best. This is what makes an ambitious goal legible: "sub 50" comes back as
   * 1:47/km, and nobody needs a verdict after reading that.
   */
  required_pace_after_stations_sec_km: number;
  /**
   * Even with every station at its best, the running budget left by this goal
   * is zero or less. Not "hard" — arithmetically unavailable.
   */
  out_of_reach: boolean;
}

/**
 * The goal against the prediction, and where the difference lives.
 *
 * Both numbers existed already and were never put in the same sentence: the
 * app knew what an athlete would run and what they had asked for, and let them
 * find out on race day. Splitting the shortfall into "the stations can give
 * this much" and "the rest has to come from the legs" is the part that makes it
 * a training decision rather than a verdict.
 */
export function goalCheck(input: {
  profile: AthleteProfile;
  state: AthleteState;
  benchmarks?: BenchmarkSample[];
  /**
   * The stored prediction, when the caller already has it. athlete_state keeps
   * predicted_race_time_sec precisely so a page does not have to re-derive it
   * (and re-read every benchmark to do so) — passing it keeps the number on
   * screen identical to the one the estimate card shows.
   */
  predictedSeconds?: number | null;
}): GoalCheck | null {
  const goal = input.profile.goal_race_time_sec;
  if (!goal || goal <= 0) return null;

  const benchmarks = input.benchmarks ?? [];
  const predicted =
    input.predictedSeconds ?? predictRaceTime(input.profile, input.state, benchmarks);
  const costs = stationCosts({
    division: input.profile.division,
    tiers: input.state.station_tiers,
    measured: input.state.measured_station_seconds,
    benchmarks,
  });

  const delta = predicted - goal;
  const availableFromStations = costs.reduce((n, c) => n + c.cost_seconds, 0);
  const stationGap = Math.max(0, Math.min(delta, availableFromStations));
  const bestStations = costs.reduce((n, c) => n + c.best_seconds, 0);
  const runningBudget = goal - bestStations - roxzoneSeconds(input.profile.experience_level);

  return {
    goal_seconds: goal,
    predicted_seconds: predicted,
    delta_seconds: delta,
    on_course: delta <= 0,
    station_gap_seconds: stationGap,
    running_gap_seconds: Math.max(0, delta - stationGap),
    worst: costs.filter((c) => c.cost_seconds > 0).slice(0, 3),
    required_pace_after_stations_sec_km:
      runningBudget > 0 ? Math.round(runningBudget / RACE_RUNS) : 0,
    out_of_reach: runningBudget <= 0,
  };
}
