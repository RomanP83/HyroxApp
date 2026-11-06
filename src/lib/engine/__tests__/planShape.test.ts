// ============================================================================
// Which kind of block a date deserves.
//
// The bug this file exists for: a plan built for a race sixty-one weeks out was
// truncated to twenty weeks and tapered at the end of them — a taper forty-one
// weeks before the race it was tapering into.
// ============================================================================
import { describe, expect, it } from "vitest";
import { PLAN_MAX_WEEKS, RACE_BLOCK_WEEKS, raceBlockFits, transitionWeeksFor } from "../index";

describe("race block or transition block", () => {
  it("periodises for a race that is actually in range", () => {
    for (const weeks of [4, 8, 12, 16, PLAN_MAX_WEEKS]) {
      expect(raceBlockFits(weeks)).toBe(true);
    }
  });

  it("refuses to periodise for a race beyond the block's own length", () => {
    for (const weeks of [PLAN_MAX_WEEKS + 1, 32, 61, 104]) {
      expect(raceBlockFits(weeks)).toBe(false);
    }
  });

  it("treats no race at all as transition work", () => {
    expect(raceBlockFits(null)).toBe(false);
  });

  it("hands over to the race block with its full runway, however far out it started", () => {
    // Walk the transition blocks forward and check the handover lands inside
    // the race block's range rather than overshooting or looping forever.
    for (const start of [21, 25, 32, 61, 104]) {
      let remaining = start;
      let blocks = 0;
      while (!raceBlockFits(remaining)) {
        remaining -= transitionWeeksFor(remaining);
        blocks++;
        expect(blocks).toBeLessThan(20); // must converge
      }
      expect(remaining).toBeGreaterThanOrEqual(RACE_BLOCK_WEEKS);
      expect(remaining).toBeLessThanOrEqual(PLAN_MAX_WEEKS);
    }
  });

  it("never proposes a transition block that would eat the race block's runway", () => {
    for (const weeks of [21, 25, 40, 61]) {
      expect(weeks - transitionWeeksFor(weeks)).toBeGreaterThanOrEqual(RACE_BLOCK_WEEKS);
    }
  });
});
