// The race, as seventeen segments. Until this existed the engine could
// prescribe a whole cycle without modelling the thing it was aimed at: station
// ability was an ordinal from 1 to 3, and "stations and transitions" was one
// constant per division.
import { describe, it, expect } from "vitest";
import {
  pacingPlan,
  RACE_RUNS,
  roxzoneFromResult,
  roxzoneSeconds,
  stationCosts,
  stationSeconds,
  STATION_ORDER,
  tiersFromRaceResult,
  type StationTiers,
} from "../index";

const evenTiers = (tier: number): StationTiers =>
  Object.fromEntries(STATION_ORDER.map((s) => [s, tier])) as StationTiers;

const zones = { easy_sec_km: 300, tempo_sec_km: 265, race_sec_km: 255, interval_sec_km: 225 };

describe("what a station costs", () => {
  it("puts a tier into seconds, which is the whole point", () => {
    // Tier 1 is ten per cent slower than tier 2, tier 3 ten per cent faster.
    const mid = stationSeconds("wall_balls", "open", 2);
    expect(stationSeconds("wall_balls", "open", 1)).toBeGreaterThan(mid);
    expect(stationSeconds("wall_balls", "open", 3)).toBeLessThan(mid);
    expect(stationSeconds("wall_balls", "open", 1) - stationSeconds("wall_balls", "open", 3)).toBe(
      Math.round(mid * 1.1) - Math.round(mid * 0.9),
    );
  });

  it("charges the heavier divisions for the heavier sleds", () => {
    expect(stationSeconds("sled_push", "pro", 2)).toBeGreaterThan(
      stationSeconds("sled_push", "open", 2),
    );
    expect(stationSeconds("wall_balls", "pro", 2)).toBeGreaterThan(
      stationSeconds("wall_balls", "open", 2),
    );
  });

  it("ranks the stations by what they actually cost, worst first", () => {
    const costs = stationCosts({
      division: "open",
      tiers: { ...evenTiers(3), wall_balls: 1, sled_push: 2 },
    });
    expect(costs[0].station).toBe("wall_balls");
    expect(costs[0].cost_seconds).toBeGreaterThan(costs[1].cost_seconds);
    // A station already at the top tier costs nothing — there is nothing to fix.
    expect(costs.find((c) => c.station === "row")!.cost_seconds).toBe(0);
  });

  it("prefers a measured time over an estimated one", () => {
    const costs = stationCosts({
      division: "open",
      tiers: evenTiers(2),
      measured: { sled_pull: 400 },
    });
    const pull = costs.find((c) => c.station === "sled_pull")!;
    expect(pull.measured).toBe(true);
    expect(pull.seconds).toBe(400);
    expect(costs.find((c) => c.station === "row")!.measured).toBe(false);
  });
});

describe("a goal time, budgeted backwards", () => {
  const plan = (goalSeconds: number, tier = 2) =>
    pacingPlan({
      division: "open",
      level: "advanced",
      goalSeconds,
      tiers: evenTiers(tier),
      paceZones: zones,
    });

  it("lays out all seventeen segments in race order", () => {
    const p = plan(5400);
    // Eight runs, eight roxzones, eight stations.
    expect(p.segments.filter((s) => s.kind === "run")).toHaveLength(RACE_RUNS);
    expect(p.segments.filter((s) => s.kind === "station")).toHaveLength(RACE_RUNS);
    expect(p.segments[0].kind).toBe("run");
    expect(p.segments[2].station).toBe("ski_erg");
    expect(p.segments[p.segments.length - 1].station).toBe("wall_balls");
  });

  it("adds up to the goal it was given, to the second", () => {
    // Not "close to": a pacing sheet is read against a stadium clock, and a
    // last line that says 1:28:01 under a 1:28:00 goal is a sheet you argue
    // with instead of race with.
    for (const goal of [4500, 4711, 5400, 5401, 5402, 5403, 5404, 5405, 5406, 5407, 6000]) {
      const p = plan(goal);
      expect(p.segments[p.segments.length - 1].cumulative_seconds).toBe(goal);
      expect(p.station_seconds + p.roxzone_seconds + p.running_seconds).toBe(goal);
      const summed = p.segments.reduce((n, s) => n + s.seconds, 0);
      expect(summed).toBe(goal);
    }
  });

  it("gives away the leftover seconds late, and never more than one per run", () => {
    const runs = plan(5405).segments.filter((s) => s.kind === "run").map((s) => s.seconds);
    expect(Math.max(...runs) - Math.min(...runs)).toBeLessThanOrEqual(1);
    // Whatever slack there is sits in the closing kilometres, not the opening
    // ones — which is the direction a race actually drifts.
    expect(runs[RACE_RUNS - 1]).toBeGreaterThanOrEqual(runs[0]);
  });

  it("subtracts the stations first, because they are what they are on the day", () => {
    // A harder goal does not make the sled faster — it makes the running
    // faster, which is the only number worth carrying to the start line.
    const slow = plan(5400);
    const fast = plan(4500);
    expect(fast.station_seconds).toBe(slow.station_seconds);
    expect(fast.required_pace_sec_km).toBeLessThan(slow.required_pace_sec_km);
  });

  it("names the gap when the goal asks for more than the legs have", () => {
    const hard = plan(4200);
    expect(hard.required_pace_sec_km).toBeLessThan(zones.race_sec_km);
    expect(hard.gap_seconds).toBeGreaterThan(0);
    // And an easy goal has no gap to report.
    expect(plan(6000).gap_seconds).toBe(0);
  });

  it("says so when the stations alone already exceed the goal", () => {
    const p = plan(1200);
    expect(p.impossible).toBe(true);
    expect(p.running_seconds).toBe(0);
  });

  it("gives a stronger athlete a shorter roxzone", () => {
    expect(roxzoneSeconds("world_class")).toBeLessThan(roxzoneSeconds("beginner"));
    expect(roxzoneSeconds("advanced")).toBe(40 * RACE_RUNS);
  });
});

describe("reading a race that actually happened", () => {
  it("lands each station on the tier its time is closest to", () => {
    const tiers = tiersFromRaceResult({
      division: "open",
      stationTimes: {
        wall_balls: stationSeconds("wall_balls", "open", 1),
        row: stationSeconds("row", "open", 3),
        sled_push: stationSeconds("sled_push", "open", 2),
      },
    });
    expect(tiers.wall_balls).toBe(1);
    expect(tiers.row).toBe(3);
    expect(tiers.sled_push).toBe(2);
    // Stations the athlete did not report keep whatever they had.
    expect(tiers.farmers_carry).toBeUndefined();
  });

  it("works out the roxzone the clock already knew", () => {
    const runSplits = Array(8).fill(300);
    const stationTimes = Object.fromEntries(STATION_ORDER.map((s) => [s, 200]));
    // 2400 running + 1600 stations, and a 5400 total leaves 1400 of walking.
    expect(roxzoneFromResult({ totalSeconds: 5400, runSplits, stationTimes })).toBe(1400);
  });

  it("never reports a negative roxzone from a sloppy entry", () => {
    expect(
      roxzoneFromResult({ totalSeconds: 100, runSplits: [300], stationTimes: { row: 200 } }),
    ).toBe(0);
  });
});
