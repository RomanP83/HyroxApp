// ============================================================================
// The race itself: what each segment costs, and what a goal time demands.
//
// The engine could prescribe a whole cycle without ever modelling the race it
// was aimed at. Station ability lived as a tier from 1 to 3 — an ordinal with
// no units — and the finish-time estimate added a single per-division constant
// for "stations and transitions". Neither can answer the question every Hyrox
// athlete actually asks: which station is costing me time, and how much.
//
// So the race is modelled here as its 17 segments: eight runs, eight stations
// and the roxzone that joins them. Everything below is arithmetic on reference
// times — no model fitting, no black box, and every number has a place it came
// from.
//
// The reference times are starting values from typical splits, in the same
// spirit as the rest of constants.ts: one place to argue with, tuned as real
// results arrive rather than guessed at again in five places.
// ============================================================================

import { STATIONS, type Division, type ExperienceLevel, type PaceZones, type Station, type StationTiers } from "./types";

/** The eight stations in race order; a run precedes each one. */
export const STATION_ORDER: Station[] = STATIONS;

export const RACE_RUNS = 8;
export const RACE_RUN_METRES = 1000;

/** What a station is called on a race split sheet. */
export const STATION_LABELS: Record<Station, string> = {
  ski_erg: "SkiErg 1000 m",
  sled_push: "Sled Push 50 m",
  sled_pull: "Sled Pull 50 m",
  burpee_broad_jump: "Burpee Broad Jumps 80 m",
  row: "RowErg 1000 m",
  farmers_carry: "Farmers Carry 200 m",
  sandbag_lunges: "Sandbag Lunges 100 m",
  wall_balls: "Wall Balls ×100",
  run: "Run 1 km",
  general: "General",
};

/**
 * Seconds a station takes at tier 2 — the middle of the three the engine
 * tracks. Open and pro are given explicitly because the loads differ; the
 * others are the same race at a different pace or a shared workload, so they
 * are a documented factor rather than forty hand-written numbers.
 */
const REFERENCE_OPEN: Record<Station, number> = {
  ski_erg: 270,
  sled_push: 180,
  sled_pull: 210,
  burpee_broad_jump: 300,
  row: 260,
  farmers_carry: 120,
  sandbag_lunges: 270,
  wall_balls: 330,
  run: 0,
  general: 0,
};

const REFERENCE_PRO: Record<Station, number> = {
  ski_erg: 250,
  sled_push: 230, // 202 kg against 152
  sled_pull: 250, // 153 kg against 103
  burpee_broad_jump: 280,
  row: 240,
  farmers_carry: 115, // 2×32 kg against 2×24
  sandbag_lunges: 260, // 30 kg against 20
  wall_balls: 360, // 9 kg against 6, and the last station of the race
  run: 0,
  general: 0,
};

/** Masters race the same stations; doubles split the work between two. */
const DIVISION_FACTOR: Record<Division, { from: "open" | "pro"; factor: number }> = {
  open: { from: "open", factor: 1 },
  pro: { from: "pro", factor: 1 },
  masters_open: { from: "open", factor: 1.1 },
  masters_pro: { from: "pro", factor: 1.1 },
  doubles: { from: "open", factor: 0.75 },
};

/**
 * How much a tier is worth in time. Tier 1 is ten per cent slower than tier 2,
 * tier 3 ten per cent faster — which is what makes "fix this station" a number
 * of minutes rather than an adjective.
 */
export const TIER_TIME_FACTOR = 0.1;

/** Seconds between stations, times eight. A race is 16 transitions of walking. */
export const ROXZONE_SEC_PER_TRANSITION: Record<ExperienceLevel, number> = {
  beginner: 60,
  intermediate: 50,
  advanced: 40,
  elite: 32,
  world_class: 25,
};

/** The reference time for one station in one division, at a given tier. */
export function stationSeconds(station: Station, division: Division, tier = 2): number {
  const spec = DIVISION_FACTOR[division] ?? DIVISION_FACTOR.open;
  const base = (spec.from === "pro" ? REFERENCE_PRO : REFERENCE_OPEN)[station] * spec.factor;
  const clamped = Math.max(1, Math.min(3, tier));
  return Math.round(base * (1 - (clamped - 2) * TIER_TIME_FACTOR));
}

/** The whole roxzone, in seconds. */
export function roxzoneSeconds(level: ExperienceLevel): number {
  return ROXZONE_SEC_PER_TRANSITION[level] * RACE_RUNS;
}

export interface StationCost {
  station: Station;
  /** What this station takes you today. */
  seconds: number;
  /** What it would take at the top tier — the version of you that owns it. */
  best_seconds: number;
  /** The difference: what this station is costing you right now. */
  cost_seconds: number;
  /** Straight from a logged race rather than estimated from a tier. */
  measured: boolean;
}

/**
 * What each station is costing, in seconds, worst first.
 *
 * This is the question the tier could never answer. A tier of 1 on the sled
 * says "you are weak here"; a cost of 42 seconds says whether it is worth a
 * block of your training — and against the wall balls' 66, which one is.
 *
 * `measured` times win over the tier estimate wherever a race has been logged:
 * the estimate exists to fill the gap until then, not to argue with it.
 */
export function stationCosts(input: {
  division: Division;
  tiers: StationTiers;
  measured?: Partial<Record<Station, number>>;
}): StationCost[] {
  return STATION_ORDER.map((station) => {
    const measured = input.measured?.[station];
    const seconds = measured ?? stationSeconds(station, input.division, input.tiers[station] ?? 2);
    const best = stationSeconds(station, input.division, 3);
    return {
      station,
      seconds,
      best_seconds: best,
      cost_seconds: Math.max(0, seconds - best),
      measured: measured != null,
    };
  }).sort((a, b) => b.cost_seconds - a.cost_seconds);
}

export interface PacingSegment {
  kind: "run" | "station" | "roxzone";
  label: string;
  station?: Station;
  /** Seconds this segment is budgeted. */
  seconds: number;
  /** Elapsed at the end of it. */
  cumulative_seconds: number;
}

export interface PacingPlan {
  goal_seconds: number;
  segments: PacingSegment[];
  station_seconds: number;
  roxzone_seconds: number;
  /** What is left for the eight kilometres. */
  running_seconds: number;
  /** The pace those kilometres have to be run at, sec/km. */
  required_pace_sec_km: number;
  /** The athlete's current race pace, for comparison. */
  current_pace_sec_km: number;
  /**
   * Seconds the goal is short by if the running stays where it is. Positive
   * means the time has to come out of the stations — and stationCosts says
   * which ones have it.
   */
  gap_seconds: number;
  /** The goal cannot be run at all: the stations alone exceed it. */
  impossible: boolean;
}

/**
 * The race, budgeted backwards from a goal time.
 *
 * Which way round this is matters. The stations and the roxzone are what they
 * are on the day — you cannot decide to push the sled faster because the clock
 * says so — so they are subtracted first and the running absorbs whatever is
 * left. That is also how the race is actually run, and it turns a goal into
 * the only number worth carrying: the pace per kilometre it demands.
 */
export function pacingPlan(input: {
  division: Division;
  level: ExperienceLevel;
  goalSeconds: number;
  tiers: StationTiers;
  paceZones: PaceZones;
  measured?: Partial<Record<Station, number>>;
}): PacingPlan {
  const costs = stationCosts({
    division: input.division,
    tiers: input.tiers,
    measured: input.measured,
  });
  const byStation = new Map(costs.map((c) => [c.station, c.seconds]));

  const stationTotal = STATION_ORDER.reduce((n, s) => n + (byStation.get(s) ?? 0), 0);
  const roxzone = roxzoneSeconds(input.level);
  const runningTotal = input.goalSeconds - stationTotal - roxzone;
  const impossible = runningTotal <= 0;
  const requiredPace = impossible ? 0 : Math.round(runningTotal / RACE_RUNS);
  const currentPace = input.paceZones.race_sec_km || 300;

  // Eight runs at one rounded pace do not add up to the running budget, and a
  // sheet whose last line reads a second past the goal is a sheet you stop
  // trusting. The leftover seconds go onto the closing runs — the split you
  // actually give away — so the clock lands exactly on the time asked for.
  const baseRun = impossible ? 0 : Math.floor(runningTotal / RACE_RUNS);
  const slowRuns = impossible ? 0 : runningTotal - baseRun * RACE_RUNS;
  const runSeconds = (i: number) => baseRun + (i >= RACE_RUNS - slowRuns ? 1 : 0);

  const segments: PacingSegment[] = [];
  let elapsed = 0;
  const perTransition = ROXZONE_SEC_PER_TRANSITION[input.level];

  STATION_ORDER.forEach((station, i) => {
    elapsed += runSeconds(i);
    segments.push({
      kind: "run",
      label: `Run ${i + 1}`,
      seconds: runSeconds(i),
      cumulative_seconds: elapsed,
    });
    elapsed += perTransition;
    segments.push({
      kind: "roxzone",
      label: `Roxzone ${i + 1}`,
      seconds: perTransition,
      cumulative_seconds: elapsed,
    });
    const stationSec = byStation.get(station) ?? 0;
    elapsed += stationSec;
    segments.push({
      kind: "station",
      label: STATION_LABELS[station],
      station,
      seconds: stationSec,
      cumulative_seconds: elapsed,
    });
  });

  return {
    goal_seconds: input.goalSeconds,
    segments,
    station_seconds: stationTotal,
    roxzone_seconds: roxzone,
    running_seconds: Math.max(0, runningTotal),
    required_pace_sec_km: requiredPace,
    current_pace_sec_km: currentPace,
    // Positive when the goal asks for a pace faster than the athlete has.
    gap_seconds: impossible ? 0 : Math.max(0, (currentPace - requiredPace) * RACE_RUNS),
    impossible,
  };
}

/**
 * Station tiers, read off a race that actually happened.
 *
 * A logged result is the best calibration data the app will ever get: eight
 * station times measured under race conditions beat any number of RPE
 * answers. Each station lands on the tier its time is closest to, so the
 * catalogues' weakness bias and the finish-time estimate both improve from one
 * entry without either of them knowing a race result exists.
 */
export function tiersFromRaceResult(input: {
  division: Division;
  stationTimes: Partial<Record<Station, number>>;
}): StationTiers {
  const tiers: StationTiers = {};
  for (const station of STATION_ORDER) {
    const measured = input.stationTimes[station];
    if (measured == null || measured <= 0) continue;
    let best: { tier: number; distance: number } | null = null;
    for (const tier of [1, 2, 3]) {
      const distance = Math.abs(measured - stationSeconds(station, input.division, tier));
      if (!best || distance < best.distance) best = { tier, distance };
    }
    if (best) tiers[station] = best.tier;
  }
  return tiers;
}

/**
 * The roxzone a result implies: whatever the total is not runs and not
 * stations. Official results report it separately, but it is derivable, and
 * an athlete typing in seventeen numbers should not have to type an eighteenth
 * the clock already knows.
 */
export function roxzoneFromResult(input: {
  totalSeconds: number;
  runSplits: number[];
  stationTimes: Partial<Record<Station, number>>;
}): number {
  const runs = input.runSplits.reduce((a, b) => a + b, 0);
  const stations = STATION_ORDER.reduce((n, s) => n + (input.stationTimes[s] ?? 0), 0);
  return Math.max(0, input.totalSeconds - runs - stations);
}
