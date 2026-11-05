import { describe, it, expect } from "vitest";
import {
  analyseRaces,
  postBbjLoss,
  runFade,
  targetSegments,
  type RaceResult,
} from "../raceAnalysis";
import { DEFAULT_SEGMENT_SHARES } from "../constants";

// Rome-like baseline: 1:24:55 with 35:43 running and 6:15 roxzone.
const baseline: RaceResult = {
  id: "b",
  kind: "race",
  held_on: "2026-03-14",
  label: "Rome",
  is_baseline: true,
  total_sec: 5095,
  runs_sec: [255, 262, 265, 268, 290, 272, 270, 261], // 2143
  stations_sec: [270, 230, 330, 420, 290, 120, 330, 587], // 2577
  roxzone_sec: 375,
};

function sim(overrides: Partial<RaceResult>): RaceResult {
  return {
    id: "s1",
    kind: "simulation",
    held_on: "2026-10-01",
    is_baseline: false,
    total_sec: 4700,
    runs_sec: [250, 255, 255, 260, 275, 262, 260, 255],
    stations_sec: [260, 210, 300, 380, 280, 110, 300, 520],
    roxzone_sec: 330,
    ...overrides,
  };
}

describe("targetSegments", () => {
  it("keeps the baseline's shape and adds up to the target", () => {
    const t = targetSegments(4200, baseline);
    const total = (t.run as number) + (t.roxzone as number) + t.stations.reduce<number>((a, b) => a + (b as number), 0);
    expect(Math.abs(total - 4200)).toBeLessThanOrEqual(10); // rounding only
    // Wall balls were the biggest station in the baseline, so they stay the biggest target.
    const wb = t.stations[7] as number;
    expect(Math.max(...(t.stations as number[]))).toBe(wb);
  });

  it("falls back to the default shares without a baseline", () => {
    const t = targetSegments(4200, null);
    expect(t.run).toBe(Math.round(4200 * DEFAULT_SEGMENT_SHARES.run));
    const shareSum =
      DEFAULT_SEGMENT_SHARES.run +
      DEFAULT_SEGMENT_SHARES.roxzone +
      DEFAULT_SEGMENT_SHARES.stations.reduce((a, b) => a + b, 0);
    expect(shareSum).toBeCloseTo(1, 5);
  });

  it("ignores a baseline with missing splits", () => {
    const partial = { ...baseline, roxzone_sec: null };
    expect(targetSegments(4200, partial).run).toBe(Math.round(4200 * DEFAULT_SEGMENT_SHARES.run));
  });
});

describe("compromised-running signals", () => {
  it("post-BBJ loss is run 5 against the mean of runs 1–4", () => {
    // mean(255,262,265,268) = 262.5 → 290 − 262.5 = 27.5 → 28
    expect(postBbjLoss(baseline)).toBe(28);
  });

  it("fade is the second four runs against the first four", () => {
    // (290+272+270+261)/4 = 273.25 − 262.5 = 10.75 → 11
    expect(runFade(baseline)).toBe(11);
  });

  it("returns null when a run is missing", () => {
    expect(postBbjLoss({ ...baseline, runs_sec: [255, null, 265, 268, 290, 272, 270, 261] })).toBeNull();
    expect(runFade(null)).toBeNull();
  });
});

describe("analyseRaces", () => {
  it("compares the latest simulation with baseline and target", () => {
    const a = analyseRaces([baseline, sim({})], 4200);
    expect(a.latest?.id).toBe("s1");
    expect(a.total_gap).toBe(500);
    expect(a.segments).toHaveLength(10);
    expect(a.readiness_coverage).toEqual({ with_data: 10, total: 10 });
    expect(a.readiness).not.toBeNull();
    expect(a.readiness as number).toBeGreaterThan(0);
    expect(a.readiness as number).toBeLessThan(100);
    // Every gap is the current value minus the target.
    for (const s of a.segments) expect(s.gap).toBe((s.current as number) - (s.target as number));
    // Worst-first by relative gap.
    const rel = a.weakest.map((s) => (s.gap as number) / (s.target as number));
    expect([...rel].sort((x, y) => y - x)).toEqual(rel);
  });

  it("uses the newest result that timed a segment", () => {
    const older = sim({ id: "s0", held_on: "2026-09-01", roxzone_sec: 340 });
    const newer = sim({ id: "s2", held_on: "2026-10-20", roxzone_sec: null });
    const a = analyseRaces([baseline, older, newer], 4200);
    expect(a.latest?.id).toBe("s2");
    expect(a.segments.find((s) => s.key === "roxzone")?.current).toBe(340);
  });

  it("marks segments on target, close and needing work", () => {
    const a = analyseRaces([baseline, sim({})], 5000);
    const statuses = new Set(a.segments.map((s) => s.status));
    expect(statuses.has("on_target")).toBe(true);
    expect(a.weakest.every((s) => (s.gap as number) > 0)).toBe(true);
  });

  it("gives no readiness without a baseline, but still compares to the target", () => {
    const a = analyseRaces([sim({})], 4200);
    expect(a.baseline).toBeNull();
    expect(a.readiness).toBeNull();
    expect(a.segments.every((s) => s.target != null && s.gap != null)).toBe(true);
  });

  it("is empty but well-formed with no results and no target", () => {
    const a = analyseRaces([], null);
    expect(a.latest).toBeNull();
    expect(a.total_gap).toBeNull();
    expect(a.segments.every((s) => s.status === "no_data")).toBe(true);
    expect(a.weakest).toEqual([]);
  });

  it("is deterministic", () => {
    const input = [baseline, sim({})];
    expect(analyseRaces(input, 4200)).toEqual(analyseRaces(input, 4200));
  });
});
