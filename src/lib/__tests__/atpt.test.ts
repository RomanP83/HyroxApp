import { describe, it, expect } from "vitest";
import { atPtTargets, isValidHrMax } from "../atpt";

describe("atPtTargets", () => {
  it("derives the trial from a maximum heart rate of 195", () => {
    expect(atPtTargets(195)).toEqual({
      hrMax: 195,
      warmupTo: 156,
      hold: 170,
      holdLow: 167,
      holdHigh: 173,
      recoveryTo: 130,
    });
  });

  it("keeps the band ordered: warm-up below the hold, recovery below the warm-up", () => {
    for (const hr of [150, 175, 200, 220]) {
      const t = atPtTargets(hr)!;
      expect(t.recoveryTo).toBeLessThan(t.warmupTo);
      expect(t.warmupTo).toBeLessThan(t.holdLow);
      expect(t.holdHigh).toBeLessThan(hr);
    }
  });

  it("refuses a heart rate that cannot be one", () => {
    expect(atPtTargets(null)).toBeNull();
    expect(atPtTargets(undefined)).toBeNull();
    expect(atPtTargets(95)).toBeNull();
    expect(atPtTargets(260)).toBeNull();
    expect(isValidHrMax(187.5)).toBe(false);
    expect(isValidHrMax(187)).toBe(true);
  });
});
