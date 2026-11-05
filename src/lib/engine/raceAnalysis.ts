// ============================================================================
// Race analysis — where the athlete stands against their target time.
//
// Input: real races and full simulations with their splits (race_results),
// one of which may be the baseline, plus the target finish time. Output: the
// target split per segment, the gap per segment, readiness from baseline to
// target, and the two compromised-running signals a split sheet carries —
// the pace lost on the run straight after the burpee broad jumps, and the fade
// of the second half of the runs against the first.
//
// Pure and deterministic like the rest of the engine. Nothing here is stored:
// every number is recomputed from the rows each time it is shown.
// ============================================================================

import { DEFAULT_SEGMENT_SHARES, SEGMENT_CLOSE_PCT } from "./constants";
import type { Station } from "./types";
import { STATIONS } from "./types";

export type RaceResultKind = "race" | "simulation";

export interface RaceResult {
  id: string;
  kind: RaceResultKind;
  held_on: string; // YYYY-MM-DD
  label?: string | null;
  is_baseline: boolean;
  total_sec: number;
  /** Run 1..8 in race order; null entries were not timed. */
  runs_sec: (number | null)[] | null;
  /** Station 1..8 in race order (STATIONS); null entries were not timed. */
  stations_sec: (number | null)[] | null;
  roxzone_sec: number | null;
}

export const STATION_LABELS: Record<Station, string> = {
  ski_erg: "SkiErg",
  sled_push: "Sled Push",
  sled_pull: "Sled Pull",
  burpee_broad_jump: "Burpee Broad Jumps",
  row: "Row",
  farmers_carry: "Farmers Carry",
  sandbag_lunges: "Sandbag Lunges",
  wall_balls: "Wall Balls",
  run: "Running",
  general: "General",
};

/** One line of the comparison: running, roxzone, or one station. */
export interface SegmentAnalysis {
  key: "run" | "roxzone" | Station;
  label: string;
  baseline: number | null;
  current: number | null;
  target: number | null;
  /** current − target in seconds; positive = slower than target. */
  gap: number | null;
  /** Share of the way from baseline to target, 0–100. */
  progress: number | null;
  status: "on_target" | "close" | "needs_work" | "no_data";
}

export interface RaceAnalysis {
  baseline: RaceResult | null;
  /** The newest result that is not the baseline. */
  latest: RaceResult | null;
  target_sec: number | null;
  /** latest total − target; positive = still slower than the target. */
  total_gap: number | null;
  segments: SegmentAnalysis[];
  /** Mean progress over all segments, only when every one has data. */
  readiness: number | null;
  /** How many segments have enough data for a progress value. */
  readiness_coverage: { with_data: number; total: number };
  /** Segments furthest behind their target, worst first (gap > 0 only). */
  weakest: SegmentAnalysis[];
  /** Run 5 (straight off the BBJ) minus the mean of runs 1–4, sec/km. */
  post_bbj_loss: { latest: number | null; baseline: number | null };
  /** Mean of runs 5–8 minus mean of runs 1–4, sec/km. */
  run_fade: { latest: number | null; baseline: number | null };
}

interface Segments {
  run: number | null;
  roxzone: number | null;
  stations: (number | null)[];
}

const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

function sum(values: (number | null)[] | null | undefined): number | null {
  if (!values || values.length !== 8 || !values.every(isTime)) return null;
  return (values as number[]).reduce((a, b) => a + b, 0);
}

function mean(values: (number | null)[]): number | null {
  if (!values.length || !values.every(isTime)) return null;
  return (values as number[]).reduce((a, b) => a + b, 0) / values.length;
}

export function segmentsOf(r: RaceResult): Segments {
  return {
    run: sum(r.runs_sec),
    roxzone: isTime(r.roxzone_sec) ? r.roxzone_sec : null,
    stations: Array.from({ length: 8 }, (_, i) => {
      const v = r.stations_sec?.[i];
      return isTime(v) ? v : null;
    }),
  };
}

/** True when every one of the 17 segments was timed. */
export function hasFullSplits(r: RaceResult): boolean {
  const s = segmentsOf(r);
  return s.run != null && s.roxzone != null && s.stations.every((v) => v != null);
}

/**
 * The target split per segment. With a fully split baseline the target keeps
 * the athlete's own shape (each segment's share of the baseline); without one
 * it uses DEFAULT_SEGMENT_SHARES. Rounded to whole seconds.
 */
export function targetSegments(targetSec: number, baseline: RaceResult | null): Segments {
  let shares: { run: number; roxzone: number; stations: readonly number[] } = DEFAULT_SEGMENT_SHARES;
  if (baseline && hasFullSplits(baseline)) {
    const s = segmentsOf(baseline);
    const whole = (s.run as number) + (s.roxzone as number) + s.stations.reduce<number>((a, b) => a + (b as number), 0);
    shares = {
      run: (s.run as number) / whole,
      roxzone: (s.roxzone as number) / whole,
      stations: s.stations.map((v) => (v as number) / whole),
    };
  }
  return {
    run: Math.round(targetSec * shares.run),
    roxzone: Math.round(targetSec * shares.roxzone),
    stations: shares.stations.map((x) => Math.round(targetSec * x)),
  };
}

/** Pace lost on run 5 — the one straight after the burpee broad jumps. */
export function postBbjLoss(r: RaceResult | null): number | null {
  if (!r?.runs_sec || r.runs_sec.length !== 8) return null;
  const before = mean(r.runs_sec.slice(0, 4));
  const after = r.runs_sec[4];
  if (before == null || !isTime(after)) return null;
  return Math.round(after - before);
}

/** How much slower the second four runs were than the first four. */
export function runFade(r: RaceResult | null): number | null {
  if (!r?.runs_sec || r.runs_sec.length !== 8) return null;
  const first = mean(r.runs_sec.slice(0, 4));
  const second = mean(r.runs_sec.slice(4));
  if (first == null || second == null) return null;
  return Math.round(second - first);
}

function statusOf(current: number | null, target: number | null): SegmentAnalysis["status"] {
  if (current == null || target == null) return "no_data";
  const gap = current - target;
  if (gap <= 0) return "on_target";
  if (gap <= target * SEGMENT_CLOSE_PCT) return "close";
  return "needs_work";
}

function progressOf(baseline: number | null, current: number | null, target: number | null): number | null {
  if (baseline == null || current == null || target == null || baseline <= target) return null;
  const pct = ((baseline - current) / (baseline - target)) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

const byDateDesc = (a: RaceResult, b: RaceResult) =>
  b.held_on.localeCompare(a.held_on) || b.id.localeCompare(a.id);

export function analyseRaces(results: RaceResult[], targetSec: number | null): RaceAnalysis {
  const baseline = results.find((r) => r.is_baseline) ?? null;
  const others = results.filter((r) => !r.is_baseline).sort(byDateDesc);
  const latest = others[0] ?? null;
  const targets = targetSec ? targetSegments(targetSec, baseline) : null;
  const base = baseline ? segmentsOf(baseline) : null;

  // "Current" per segment = the newest non-baseline result that timed it: a
  // simulation that skipped the roxzone clock still counts for its stations.
  const newest = (pick: (s: Segments) => number | null): number | null => {
    for (const r of others) {
      const v = pick(segmentsOf(r));
      if (v != null) return v;
    }
    return null;
  };

  const line = (
    key: SegmentAnalysis["key"],
    label: string,
    pick: (s: Segments) => number | null,
  ): SegmentAnalysis => {
    const b = base ? pick(base) : null;
    const c = newest(pick);
    const t = targets ? pick(targets) : null;
    return {
      key,
      label,
      baseline: b,
      current: c,
      target: t,
      gap: c != null && t != null ? c - t : null,
      progress: progressOf(b, c, t),
      status: statusOf(c, t),
    };
  };

  const segments: SegmentAnalysis[] = [
    line("run", "Running (8 × 1 km)", (s) => s.run),
    ...STATIONS.map((st, i) => line(st, STATION_LABELS[st], (s) => s.stations[i])),
    line("roxzone", "Roxzone", (s) => s.roxzone),
  ];

  const withProgress = segments.filter((s) => s.progress != null);
  const readiness =
    withProgress.length === segments.length
      ? Math.round(withProgress.reduce((a, s) => a + (s.progress as number), 0) / segments.length)
      : null;

  const weakest = segments
    .filter((s) => s.gap != null && s.gap > 0 && s.target)
    .sort((a, b) => (b.gap as number) / (b.target as number) - (a.gap as number) / (a.target as number))
    .slice(0, 3);

  return {
    baseline,
    latest,
    target_sec: targetSec,
    total_gap: latest && targetSec ? latest.total_sec - targetSec : null,
    segments,
    readiness,
    readiness_coverage: { with_data: withProgress.length, total: segments.length },
    weakest,
    post_bbj_loss: { latest: postBbjLoss(latest), baseline: postBbjLoss(baseline) },
    run_fade: { latest: runFade(latest), baseline: runFade(baseline) },
  };
}
