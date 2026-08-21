import { describe, it, expect } from "vitest";
import { computeSessionFeedback, type FeedbackInput } from "../feedback";

function input(overrides: Partial<FeedbackInput> = {}): FeedbackInput {
  return {
    sessionType: "run_easy",
    rpeTarget: 6,
    rpeActual: 6,
    plannedDurationMin: 45,
    actualDurationMin: 45,
    ...overrides,
  };
}

describe("computeSessionFeedback", () => {
  it("perfect execution scores 100 with all metrics on target", () => {
    const fb = computeSessionFeedback(input());
    expect(fb.score).toBe(100);
    expect(fb.metrics.every((m) => m.verdict === "on_target")).toBe(true);
    expect(fb.headline).toBe("Dialed in!");
    expect(fb.coachText.length).toBeGreaterThan(20);
  });

  it("cut-short session flags duration and load as below target", () => {
    // Mirrors the reference screenshot: 23' of 45', pace perfect.
    const fb = computeSessionFeedback(
      input({
        actualDurationMin: 23,
        targetPaceSecKm: 278,
        actualPaceSecKm: 278,
      }),
    );
    const byKey = Object.fromEntries(fb.metrics.map((m) => [m.key, m]));
    expect(byKey.duration.verdict).toBe("below");
    expect(byKey.duration.badge).toBe("TOO SHORT");
    expect(byKey.load.verdict).toBe("below");
    expect(byKey.pace.verdict).toBe("on_target");
    expect(byKey.pace.badge).toBe("PERFECT");
    expect(fb.score).toBeGreaterThan(30);
    expect(fb.score).toBeLessThan(90);
    // Coach text names the biggest shortfall and credits the pace.
    expect(fb.coachText.toLowerCase()).toContain("pace");
  });

  it("harder-than-planned session flags intensity above target", () => {
    const fb = computeSessionFeedback(input({ rpeActual: 8 }));
    const intensity = fb.metrics.find((m) => m.key === "intensity")!;
    expect(intensity.verdict).toBe("above");
    expect(intensity.badge).toBe("TOO HARD");
    expect(fb.score).toBeLessThan(100);
  });

  it("pace direction is inverted: fewer sec/km = TOO FAST", () => {
    const fb = computeSessionFeedback(
      input({ targetPaceSecKm: 300, actualPaceSecKm: 260 }),
    );
    const pace = fb.metrics.find((m) => m.key === "pace")!;
    expect(pace.verdict).toBe("below");
    expect(pace.badge).toBe("TOO FAST");
  });

  it("optional metrics only appear when both values are present", () => {
    const without = computeSessionFeedback(input());
    expect(without.metrics.map((m) => m.key)).toEqual(["load", "duration", "intensity"]);
    const withAll = computeSessionFeedback(
      input({
        targetPaceSecKm: 300,
        actualPaceSecKm: 300,
        plannedDistanceM: 6000,
        actualDistanceM: 5000,
      }),
    );
    expect(withAll.metrics.map((m) => m.key)).toContain("pace");
    expect(withAll.metrics.map((m) => m.key)).toContain("distance");
  });

  it("score is bounded 0..100 even at extreme deviations", () => {
    const fb = computeSessionFeedback(
      input({ rpeActual: 10, actualDurationMin: 200 }),
    );
    expect(fb.score).toBeGreaterThanOrEqual(0);
    expect(fb.score).toBeLessThanOrEqual(100);
  });

  it("is deterministic", () => {
    const a = computeSessionFeedback(input({ actualDurationMin: 30 }));
    const b = computeSessionFeedback(input({ actualDurationMin: 30 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
