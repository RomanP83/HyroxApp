// ============================================================================
// Weighting a phase's weeks across the stations that phase can serve.
// ============================================================================
import { describe, expect, it } from "vitest";
import { capFor, MIN_WEEKS_PER_STATION, weightedStationOrder } from "../stationFocus";
import type { Station } from "../types";

const POOL: Station[] = ["ski_erg", "sled_push", "wall_balls"];
const tally = (order: Station[]) =>
  order.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});

describe("apportioning a phase's weeks by what the stations cost", () => {
  it("hands out exactly as many weeks as the phase has", () => {
    for (const seats of [0, 1, 2, 3, 5, 10]) {
      expect(weightedStationOrder(POOL, { wall_balls: 60 }, seats)).toHaveLength(seats);
    }
  });

  it("gives the expensive station more weeks than the cheap one", () => {
    const counts = tally(
      weightedStationOrder(POOL, { ski_erg: 10, sled_push: 20, wall_balls: 60 }, 9),
    );
    expect(counts.wall_balls).toBeGreaterThan(counts.sled_push);
    expect(counts.sled_push).toBeGreaterThanOrEqual(counts.ski_erg);
  });

  it("never drops a station the phase can train", () => {
    // A station trained zero times decays, and the cost is an estimate until a
    // race is logged.
    const counts = tally(weightedStationOrder(POOL, { wall_balls: 999 }, 8));
    for (const station of POOL) {
      expect(counts[station] ?? 0).toBeGreaterThanOrEqual(MIN_WEEKS_PER_STATION);
    }
  });

  it("never lets one station take the phase", () => {
    // Uncapped, a single station with any cost at all took nine of sixteen
    // weeks — the floor protects the minimum, not the maximum.
    const seats = 12;
    const counts = tally(weightedStationOrder(POOL, { wall_balls: 999 }, seats));
    const cap = capFor(seats, POOL.length);
    for (const station of POOL) expect(counts[station] ?? 0).toBeLessThanOrEqual(cap);
    expect(counts.wall_balls).toBeLessThan(seats);
  });

  it("falls back to a round robin when nothing distinguishes the stations", () => {
    // Every station at the top tier costs nothing; there is no reason to prefer
    // any of them, and an even split is the right answer.
    const counts = tally(weightedStationOrder(POOL, {}, 6));
    for (const station of POOL) expect(counts[station]).toBe(2);
  });

  it("does not put a station in two weeks running while another is waiting", () => {
    const order = weightedStationOrder(POOL, { wall_balls: 60, sled_push: 30, ski_erg: 20 }, 9);
    for (let i = 1; i < order.length; i++) {
      expect(order[i], `week ${i + 1} repeats ${order[i]}`).not.toBe(order[i - 1]);
    }
  });

  it("gives the minimum to the costliest first when the phase is too short for all", () => {
    // Two weeks, three stations: somebody misses out, and it should be the one
    // with least to gain.
    const order = weightedStationOrder(POOL, { wall_balls: 60, sled_push: 30, ski_erg: 1 }, 2);
    expect(order).toContain("wall_balls");
    expect(order).not.toContain("ski_erg");
  });

  it("survives an empty pool and a zero-week phase", () => {
    expect(weightedStationOrder([], { wall_balls: 60 }, 5)).toEqual([]);
    expect(weightedStationOrder(POOL, { wall_balls: 60 }, 0)).toEqual([]);
  });

  it("is deterministic — the same phase produces the same weeks", () => {
    const once = weightedStationOrder(POOL, { wall_balls: 60, ski_erg: 20 }, 7);
    const twice = weightedStationOrder(POOL, { wall_balls: 60, ski_erg: 20 }, 7);
    expect(once).toEqual(twice);
  });
});
