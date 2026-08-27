// ============================================================================
// Engine constants (Implementation Plan §5 + §5 "Ehrliche Einordnung")
// These are *starting values from training literature*, not fixed truths —
// they get tuned in the beta with real logs (which is why every adaptive
// action is audited in plan_adjustments). Keep them here, in one place.
// ============================================================================

import type {
  ExperienceLevel,
  TransitionModule,
  PhaseType,
  SessionType,
  PaceZones,
  StationTiers,
} from "./types";
import { STATIONS } from "./types";

export const ENGINE_VERSION = "v1.2";

// ── Macro phase-split lookup (weeks_to_race -> [base, build, peak, taper]) ────
// Taper is never negotiable (PP4).
// A 16-week cycle earns the long taper (the reference's "1-2 weeks") and the
// full 4-week peak; shorter cycles shed taper first to 1, then peak weeks.
export const PHASE_SPLIT_TABLE: Record<number, [number, number, number, number]> = {
  16: [5, 5, 4, 2],
  12: [4, 4, 3, 1],
  10: [3, 4, 2, 1],
  8: [2, 3, 2, 1],
};

// ── Session-slot priority per phase (highest priority first) ─────────────────
// This no longer decides WHAT a week trains — TRAINING_MIX does, per level as
// well as per phase. What survives here is ORDER and precedence: who gives way
// when a hard session has to be capped, and which run type the phase reaches
// for next. Running leads every phase because a Hyrox is 50-60% a running race.
export const PHASE_SLOT_PRIORITY: Record<PhaseType, SessionType[]> = {
  base: ["long_run", "strength", "run_intervals", "run_easy", "station_work", "mobility"],
  // Station work sits ahead of the recovery run in build and peak: a Hyrox
  // build block without a dedicated station session is not a Hyrox plan, and
  // the recovery run is the slot a double day gives back (pmTypeFor() puts an
  // easy run after a station or strength morning). An athlete at five days and
  // no doubles will see the week's polarised share flagged — that trade-off is
  // reported, not hidden.
  build: ["compromised_run", "run_intervals", "long_run", "strength", "station_work", "run_easy"],
  // No full_sim here on purpose: a complete race simulation costs 2-3 days of
  // recovery, so the plan places exactly ONE per cycle (generate.ts) instead of
  // one every peak week. The peak weeks run station-interval work instead.
  peak: ["compromised_run", "run_intervals", "long_run", "station_work", "strength", "run_easy"],
  // Race week keeps a light strength primer: speed off the floor, nothing
  // emptied. Dropping strength entirely is how athletes arrive flat.
  taper: ["run_intervals", "compromised_run", "run_easy", "strength", "station_work", "long_run"],
};

// ── The training mix, by level and phase ────────────────────────────────────
// Hyrox is 50-60% a running race, so aerobic running economy is the floor
// everything else stands on. Across a macrocycle the emphasis then moves from
// maximal strength and Zone-2 base towards race-specific compromised running
// and lactate tolerance — the same athlete, a different problem each block.
//
// These are shares of PLANNED MINUTES, not session counts: an 80-minute long
// run and a 50-minute station session are not one unit each. distributeSlots()
// apportions the week's sessions against them (micro.ts), carrying the
// remainder across the weeks of a phase, which is how a 5% share still shows
// up roughly every fourth week instead of rounding away to never.
//
// Running here is all three run types together; the sub-order inside it is the
// phase's own (long run first, then the quality session, then easy volume).

export interface TrainingMix {
  run: number;
  strength: number;
  station: number;
  compromised: number;
}

export const TRAINING_MIX: Record<ExperienceLevel, Record<PhaseType, TrainingMix>> = {
  beginner: {
    base: { run: 0.45, strength: 0.35, station: 0.15, compromised: 0.05 },
    build: { run: 0.4, strength: 0.25, station: 0.2, compromised: 0.15 },
    peak: { run: 0.35, strength: 0.15, station: 0.2, compromised: 0.3 },
    taper: { run: 0.5, strength: 0.1, station: 0.15, compromised: 0.25 },
  },
  intermediate: {
    base: { run: 0.5, strength: 0.3, station: 0.15, compromised: 0.05 },
    build: { run: 0.4, strength: 0.2, station: 0.2, compromised: 0.2 },
    peak: { run: 0.35, strength: 0.15, station: 0.2, compromised: 0.3 },
    taper: { run: 0.45, strength: 0.1, station: 0.2, compromised: 0.25 },
  },
  advanced: {
    base: { run: 0.5, strength: 0.25, station: 0.15, compromised: 0.1 },
    build: { run: 0.35, strength: 0.2, station: 0.2, compromised: 0.25 },
    peak: { run: 0.3, strength: 0.1, station: 0.25, compromised: 0.35 },
    taper: { run: 0.45, strength: 0.1, station: 0.2, compromised: 0.25 },
  },
  elite: {
    base: { run: 0.55, strength: 0.2, station: 0.15, compromised: 0.1 },
    build: { run: 0.35, strength: 0.15, station: 0.2, compromised: 0.3 },
    peak: { run: 0.3, strength: 0.1, station: 0.25, compromised: 0.35 },
    taper: { run: 0.45, strength: 0.1, station: 0.2, compromised: 0.25 },
  },
  world_class: {
    base: { run: 0.55, strength: 0.2, station: 0.15, compromised: 0.1 },
    build: { run: 0.35, strength: 0.15, station: 0.2, compromised: 0.3 },
    peak: { run: 0.3, strength: 0.1, station: 0.25, compromised: 0.35 },
    taper: { run: 0.45, strength: 0.05, station: 0.2, compromised: 0.3 },
  },
};

/**
 * Hours between the two sessions of a double day. Below two the second session
 * is training on top of unrecovered fatigue rather than a second stimulus;
 * beyond six it is simply a separate day's worth of load.
 */
export const DOUBLE_DAY_GAP_HOURS = { min: 2, max: 6 } as const;

/**
 * Hard days a week may hold — threshold/interval work, compromised running,
 * a simulation or a benchmark. Two is the ceiling: everything above it eats
 * the aerobic base that carries 50-60% of the race.
 */
export const MAX_HARD_SESSIONS_PER_WEEK = 2;

export const PHASE_VOLUME_MULTIPLIER: Record<PhaseType, number> = {
  base: 1.0,
  build: 1.1,
  peak: 1.0,
  taper: 0.5,
};

export const PHASE_RPE_TARGET: Record<PhaseType, number> = {
  base: 5,
  build: 7,
  peak: 8,
  taper: 5,
};

// ── The transition block, module by module ──────────────────────────────────
// What happens between a race and the start of the next macrocycle is not one
// undifferentiated "easy block". It is four stages that build on each other,
// and which of them an athlete gets depends on how much room there is before
// the next goal.
//
// The load climbs from nothing to near-normal across them, and the specificity
// stays at zero throughout: no compromised running anywhere in a transition
// block, no simulation, no benchmark. Race specificity is what the next
// macrocycle is for; this block exists to arrive at it intact.

export interface TransitionModuleSpec {
  module: TransitionModule;
  name: string;
  /** Share of the volume a race block's base week would carry. */
  volume: number;
  /** Ceiling on the week's RPE targets — the module's whole point, some weeks. */
  rpe_cap: number;
  /** The training mix for the week; compromised is 0 in every module. */
  mix: TrainingMix;
  /** Threshold and VO2max work: not before the capacity is back. */
  intervals: boolean;
  /**
   * A long run. The re-introduction week is 2-3 SHORT aerobic runs — putting
   * a long run in it is the one thing that would make the week what it is not.
   */
  long_run: boolean;
  /** One line on the week card, in the athlete's words. */
  focus: string;
}

export const TRANSITION_MODULES: Record<TransitionModule, TransitionModuleSpec> = {
  // Week 1. Days 1-3 carry nothing at all; days 4-7 move without impact —
  // spinning, swimming, walking, mobility. No running, no landings, no lifting.
  reset: {
    module: "reset",
    name: "Reset",
    volume: 0.15,
    rpe_cap: 3,
    mix: { run: 0, strength: 0, station: 0, compromised: 0 },
    intervals: false,
    long_run: false,
    focus:
      "Complete recovery. The first three days carry nothing; the rest is movement without impact — spin, swim, walk, mobility. No running, no landings, no lifting. The nervous system is what is recovering, and it does not negotiate.",
  },
  // Week 2. Short aerobic runs, light full-body strength, erg technique.
  reintroduction: {
    module: "reintroduction",
    name: "Re-Introduction",
    volume: 0.45,
    rpe_cap: 6,
    mix: { run: 0.4, strength: 0.45, station: 0.15, compromised: 0 },
    intervals: false,
    long_run: false,
    focus:
      "Back into training, gently. Short Zone 1-2 runs, light full-body strength at high reps and nowhere near failure, and erg technique. Nothing is measured this week and nothing is simulated.",
  },
  // Week 3. Volume back to normal in the aerobic range, real lifts again.
  reload: {
    module: "reload",
    name: "Volume Reload",
    volume: 0.65,
    rpe_cap: 8,
    mix: { run: 0.55, strength: 0.3, station: 0.15, compromised: 0 },
    intervals: true,
    long_run: true,
    focus:
      "Training capacity back. Running volume normalises in Zone 2 with at most one moderate stimulus, and the main lifts return at 3-4 sets around RPE 7. A good week to look back at the race and name the weakness the next cycle should attack.",
  },
  // Week 4 onwards. The off-season proper: strength and weaknesses, polarised
  // aerobic volume, and still not one metre of compromised running.
  offseason: {
    module: "offseason",
    name: "Off-Season",
    volume: 0.8,
    rpe_cap: 9,
    mix: { run: 0.55, strength: 0.25, station: 0.2, compromised: 0 },
    intervals: true,
    long_run: true,
    focus:
      "Off-season: the block where weaknesses get fixed rather than worked around. Heavy compounds in the low single digits, high Zone-2 volume across running and the ergs, and isolated station work on whatever the race exposed. Still no compromised running — that belongs to the next cycle.",
  },
};

/** Ordered, which is how a block of N weeks is filled. */
export const TRANSITION_ORDER: TransitionModule[] = [
  "reset",
  "reintroduction",
  "reload",
  "offseason",
];

/**
 * The longest plan the format holds. A race block never needs more (the switch
 * into race-specific work happens 12-16 weeks out), and it is how far an
 * open-ended transition block runs before it has to be extended.
 */
export const PLAN_MAX_WEEKS = 20;

/**
 * The runway a race block wants. Anything beyond it before the next race is
 * where the off-season module stretches out — the switch into race-specific
 * work happens 12-16 weeks out, not the day after the last race.
 */
export const RACE_BLOCK_WEEKS = 16;

/** Every fourth off-season week is a deload: three loading, one at -40%. */
export const OFFSEASON_DELOAD_EVERY = 4;

export const DELOAD_VOLUME_MULTIPLIER = 0.6; // §5: every 4th week in base/build

// ── Adaptive engine tuning constants (§5 Schritt 4 / "Ehrliche Einordnung") ──
export const RPE_DELTA_UP_THRESHOLD = -2; // too easy -> step up (needs 2 in a row)
export const RPE_DELTA_DOWN_THRESHOLD = 2; // too hard -> step down immediately
export const PACE_STEP_SEC_KM = 5; // one step = 5 s/km faster
export const LOAD_STEP_PCT = 0.05; // one step = +5% load
export const PACE_WEEKLY_CAP_PCT = 0.03; // ±3% per week — no runaway
export const PACE_REF_WINDOW_DAYS = 7; // pace-cap snapshot renews weekly (A7)
export const TIER_MIN = 1;
export const TIER_MAX = 3;
export const STRENGTH_STEP = 0.05; // one strength calibration step = ±5% (A6)
export const STRENGTH_MODIFIER_MIN = 0.8;
export const STRENGTH_MODIFIER_MAX = 1.2;

// ACWR guardrails (§5 Layer 2)
export const ACWR_SOFT = 1.3; // trim remaining week x0.85
export const ACWR_HARD = 1.5; // auto-deload
export const ACWR_LOW = 0.8; // ramp-up re-entry
export const ACWR_SOFT_TRIM = 0.85;
export const RPE_HIGH_14D = 8.5; // sustained high strain -> auto-deload
export const INACTIVE_REBASE_DAYS = 7;

// ── Tunable calibration constants (Phase D2) ─────────────────────────────────
// Everything a beta might want to adjust lives in this shape. The compiled
// values below are the defaults; the server merges engine_config (DB, keyed by
// engine_version) over them — tuning without a deploy, still deterministic.
export interface EngineTuning {
  rpe_delta_up_threshold: number;
  rpe_delta_down_threshold: number;
  pace_step_sec_km: number;
  pace_weekly_cap_pct: number;
  pace_ref_window_days: number;
  strength_step: number;
  strength_modifier_min: number;
  strength_modifier_max: number;
  acwr_soft: number;
  acwr_hard: number;
  acwr_low: number;
  acwr_soft_trim: number;
  rpe_high_14d: number;
  inactive_rebase_days: number;
}

export const DEFAULT_TUNING: EngineTuning = {
  rpe_delta_up_threshold: RPE_DELTA_UP_THRESHOLD,
  rpe_delta_down_threshold: RPE_DELTA_DOWN_THRESHOLD,
  pace_step_sec_km: PACE_STEP_SEC_KM,
  pace_weekly_cap_pct: PACE_WEEKLY_CAP_PCT,
  pace_ref_window_days: PACE_REF_WINDOW_DAYS,
  strength_step: STRENGTH_STEP,
  strength_modifier_min: STRENGTH_MODIFIER_MIN,
  strength_modifier_max: STRENGTH_MODIFIER_MAX,
  acwr_soft: ACWR_SOFT,
  acwr_hard: ACWR_HARD,
  acwr_low: ACWR_LOW,
  acwr_soft_trim: ACWR_SOFT_TRIM,
  rpe_high_14d: RPE_HIGH_14D,
  inactive_rebase_days: INACTIVE_REBASE_DAYS,
};

// ── Season periodisation (annual macro layer, above the 4-20 week plan) ─────
// The numbers a head coach would argue about, in one place. Everything the
// season planner does is derived from these — no magic numbers in season.ts.
export const SEASON_TUNING = {
  /** Post-race recovery, by the priority of the race just finished. */
  recovery_weeks: { A: 3, B: 2, C: 2 },
  /** Taper length for an A race: the long form needs a long enough cycle. */
  taper_weeks_long: 2,
  taper_weeks_short: 1,
  taper_long_cycle_min_weeks: 12,
  /** Race-specific block (compromised running, pacing sims, bricks). */
  race_specific_min_weeks: 3,
  /** Once a cycle can carry it, the block gets the full coached minimum. */
  race_specific_full_min_weeks: 6,
  race_specific_full_from_weeks: 12,
  race_specific_max_weeks: 8,
  race_specific_share: 0.45,
  /** Build block (VO2max, lactate tolerance, threshold, EMOMs). */
  build_min_weeks: 3,
  build_max_weeks: 10,
  build_share: 0.6,
  /** Below this, an inter-race gap becomes one re-build bridge, not a cycle. */
  bridge_max_weeks: 4,
  /** Deload every Nth TRAINING week of a cycle, at this volume. */
  deload_every_n_weeks: 4,
  deload_volume_multiplier: 0.65, // -35%
  /** Planning horizon when the calendar runs out of races. */
  default_horizon_weeks: 52,
  /**
   * What a race that does NOT anchor a macrocycle does to the training weeks
   * around it. An A race gets a real cycle (taper block + recovery block); a
   * B or C race rides inside the block it falls in, and only bends the days
   * immediately around it.
   *
   *   B — a race that matters, but not THE race: a short taper (the hard
   *       sessions in the days before come out), then two easy days.
   *   C — a tune-up: no taper at all. The race IS the week's hard session,
   *       which is why only the day before is eased off.
   */
  secondary_race: {
    B: {
      easy_days_before: 3,
      recovery_days_after: 2,
      week_volume_multiplier: 0.8,
      label: "Secondary race",
    },
    C: {
      easy_days_before: 1,
      recovery_days_after: 1,
      week_volume_multiplier: 0.95,
      label: "Tune-up race",
    },
  },
  /** Planned minutes for a race day in the plan (a Hyrox, warm-up included). */
  race_day_minutes: 90,
  /** Volume relative to the athlete's normal week, per block kind. */
  volume: {
    post_race_recovery: 0.55,
    base: 1.0,
    build: 1.1,
    race_specific: 1.0,
    bridge: 0.9,
    taper: 0.6, // -40%
    open_base: 0.85,
  },
} as const;

// ── Default pace zones derived from a 5k time (fallback if unknown) ──────────
export const DEFAULT_5K_SECONDS = 1500; // 25:00

export function defaultPaceZones(fiveKSeconds: number | null): PaceZones {
  const fiveK = fiveKSeconds ?? DEFAULT_5K_SECONDS;
  const racePace = fiveK / 5; // sec per km at ~5k effort
  return {
    interval_sec_km: Math.round(racePace * 0.95),
    race_sec_km: Math.round(racePace * 1.02),
    tempo_sec_km: Math.round(racePace * 1.08),
    easy_sec_km: Math.round(racePace * 1.25),
  };
}

export function defaultStationTiers(level: string): StationTiers {
  // Three tiers of prescription, five levels of athlete: elite and world-class
  // start on the top tier and differentiate through calibration, not the seed.
  const tier =
    level === "advanced" || level === "elite" || level === "world_class"
      ? 3
      : level === "beginner"
        ? 1
        : 2;
  const tiers: StationTiers = {};
  for (const s of STATIONS) tiers[s] = tier;
  return tiers;
}

// ── Goal times ──────────────────────────────────────────────────────────────

/**
 * The finish time each level has always implied, now as a number.
 *
 * These are the times the level control has been promising in its own label
 * ("Competitive · sub 1:20") without anything ever checking them. They are a
 * starting point only: the goal is the athlete's to set, and the level goes
 * back to describing what they can currently carry.
 */
export const GOAL_SECONDS_BY_LEVEL: Record<ExperienceLevel, number> = {
  beginner: 100 * 60, // 1:40
  intermediate: 90 * 60, // 1:30
  advanced: 80 * 60, // 1:20
  elite: 70 * 60, // 1:10
  world_class: 60 * 60, // 1:00
};

/** The goal an athlete starts with, before they have said otherwise. */
export function goalSecondsForLevel(level: ExperienceLevel): number {
  return GOAL_SECONDS_BY_LEVEL[level] ?? GOAL_SECONDS_BY_LEVEL.intermediate;
}
