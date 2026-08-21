// ============================================================================
// Goal-time prognosis v1 (Implementation Plan §2 Must-Have)
// Weighted benchmark formula. Deliberately labelled an ESTIMATE until beta
// logs calibrate the weights (§2). Cheap because athlete_state already exists.
// ============================================================================

import type { AthleteProfile, AthleteState, Division } from "./types";

export interface BenchmarkSample {
  slug: string; // benchmark_definitions.slug
  value: number; // metric value (sec, reps, or m)
}

// Rough division-level overhead on top of pure running (transitions + stations).
const DIVISION_STATION_OVERHEAD_SEC: Record<Division, number> = {
  open: 1800, // ~30 min of station + roxzone work for a mid-pack open athlete
  pro: 1500,
  doubles: 1500,
  masters_open: 1950,
  masters_pro: 1650,
};

/**
 * Predict total Hyrox finish time (seconds).
 * Base model: 8 km of running at race pace + a station overhead that shrinks
 * as station tiers rise, nudged by any fresh benchmark samples.
 */
export function predictRaceTime(
  profile: AthleteProfile,
  state: AthleteState,
  benchmarks: BenchmarkSample[] = [],
): number {
  const racePace = state.pace_zones.race_sec_km || 300; // sec/km fallback 5:00
  const runningSeconds = (racePace * 8000) / 1000;

  // Station overhead scaled by mean station tier (tier 3 => fitter => faster).
  const tiers = Object.values(state.station_tiers);
  const meanTier = tiers.length ? tiers.reduce((a, b) => a + b, 0) / tiers.length : 2;
  const overheadBase = DIVISION_STATION_OVERHEAD_SEC[profile.division] ?? 1800;
  const overhead = overheadBase * (1 - (meanTier - 2) * 0.08); // ±8% per tier off 2

  let predicted = runningSeconds + overhead;

  // Benchmark nudges: a strong 1k / wall-ball score pulls the estimate down.
  const wallBalls = benchmarks.find((b) => b.slug === "wall_balls");
  if (wallBalls) {
    // >70 reps in 2 min is strong; scale ±60s across a 40..90 rep window.
    const norm = Math.max(-1, Math.min(1, (wallBalls.value - 65) / 25));
    predicted -= norm * 60;
  }
  const run1k = benchmarks.find((b) => b.slug === "run_1k");
  if (run1k) {
    // Fast 1k implies the race-pace assumption is conservative.
    const impliedRacePace = run1k.value * 1.12; // 1k TT -> race pace proxy
    predicted += ((impliedRacePace - racePace) * 8000) / 1000 * 0.3;
  }

  return Math.round(predicted);
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
