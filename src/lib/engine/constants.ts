// ============================================================================
// Engine constants (Implementation Plan §5 + §5 "Ehrliche Einordnung")
// These are *starting values from training literature*, not fixed truths —
// they get tuned in the beta with real logs (which is why every adaptive
// action is audited in plan_adjustments). Keep them here, in one place.
// ============================================================================

import type { PhaseType, SessionType, PaceZones, StationTiers } from "./types";
import { STATIONS } from "./types";

export const ENGINE_VERSION = "v1.2";

// ── Macro phase-split lookup (weeks_to_race -> [base, build, peak, taper]) ────
// Taper is never negotiable (PP4).
export const PHASE_SPLIT_TABLE: Record<number, [number, number, number, number]> = {
  16: [6, 6, 3, 1],
  12: [4, 4, 3, 1],
  10: [3, 4, 2, 1],
  8: [2, 3, 2, 1],
};

// ── Session-slot priority per phase (highest priority first) ─────────────────
// training_days_per_week decides how many slots survive; lowest-priority drops
// first, and a 5th day adds run_easy.
// Running is 50-60% of a Hyrox, so the run sessions lead each phase's order.
// Base is deliberately free of compromised running: pure running economy first,
// no sled/lunge load on the tendons yet (see COMPROMISED_PER_WEEK).
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

/**
 * Hard days a week may hold — threshold/interval work, compromised running,
 * a simulation or a benchmark. Two is the ceiling: everything above it eats
 * the aerobic base that carries 50-60% of the race.
 */
export const MAX_HARD_SESSIONS_PER_WEEK = 2;

// Compromised-running frequency ramps base -> peak (§5 Schritt 2).
// Base is 0 on purpose: the base block builds running economy without the
// orthopaedic load of sleds and lunges; compromised work starts in the build.
export const COMPROMISED_PER_WEEK: Record<PhaseType, number> = {
  base: 0,
  build: 1,
  peak: 2,
  taper: 1,
};

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
  const tier = level === "advanced" ? 3 : level === "beginner" ? 1 : 2;
  const tiers: StationTiers = {};
  for (const s of STATIONS) tiers[s] = tier;
  return tiers;
}
