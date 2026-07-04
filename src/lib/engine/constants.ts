// ============================================================================
// Engine constants (Implementation Plan §5 + §5 "Ehrliche Einordnung")
// These are *starting values from training literature*, not fixed truths —
// they get tuned in the beta with real logs (which is why every adaptive
// action is audited in plan_adjustments). Keep them here, in one place.
// ============================================================================

import type { PhaseType, SessionType, PaceZones, StationTiers } from "./types";
import { STATIONS } from "./types";

export const ENGINE_VERSION = "v1.1";

// ── Macro phase-split lookup (weeks_to_race -> [base, build, peak, taper]) ────
// Taper is never negotiable (PP4).
export const PHASE_SPLIT_TABLE: Record<number, [number, number, number, number]> = {
  16: [6, 6, 3, 1],
  12: [4, 5, 2, 1],
  10: [3, 4, 2, 1],
  8: [2, 3, 2, 1],
};

// ── Session-slot priority per phase (highest priority first) ─────────────────
// training_days_per_week decides how many slots survive; lowest-priority drops
// first, and a 5th day adds run_easy.
export const PHASE_SLOT_PRIORITY: Record<PhaseType, SessionType[]> = {
  base: ["run_easy", "strength", "station_work", "compromised_run", "run_intervals", "mobility"],
  build: ["compromised_run", "strength", "station_work", "run_intervals", "run_easy", "mobility"],
  peak: ["full_sim", "compromised_run", "station_work", "run_intervals", "strength", "run_easy"],
  taper: ["run_intervals", "compromised_run", "station_work", "run_easy", "mobility", "strength"],
};

// Compromised-running frequency ramps base -> peak (§5 Schritt 2).
export const COMPROMISED_PER_WEEK: Record<PhaseType, number> = {
  base: 0.5, // every 2 weeks
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
export const TIER_MIN = 1;
export const TIER_MAX = 3;

// ACWR guardrails (§5 Layer 2)
export const ACWR_SOFT = 1.3; // trim remaining week x0.85
export const ACWR_HARD = 1.5; // auto-deload
export const ACWR_LOW = 0.8; // ramp-up re-entry
export const ACWR_SOFT_TRIM = 0.85;
export const RPE_HIGH_14D = 8.5; // sustained high strain -> auto-deload
export const INACTIVE_REBASE_DAYS = 7;

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
