import { describe, it, expect } from "vitest";
import { assessWeekPreferences, layoutWeek } from "../micro";
import type { SessionType } from "../types";

// A representative build week: two hard runs, the long run, strength, stations.
const BUILD: SessionType[] = [
  "compromised_run",
  "run_intervals",
  "long_run",
  "strength",
  "station_work",
];

/** day -> session type, for readable assertions. */
function byDay(types: SessionType[], prefs: Parameters<typeof layoutWeek>[1]) {
  const { days, warnings } = layoutWeek(types, prefs);
  const map = new Map<number, SessionType>();
  types.forEach((t, i) => map.set(days[i], t));
  return { map, warnings, days };
}

describe("hard pin", () => {
  it("puts the long run on the day the athlete chose", () => {
    const { map } = byDay(BUILD, { longRunDay: 7 });
    expect(map.get(7)).toBe("long_run");
  });

  it("puts strength on the chosen days, in order", () => {
    const twoStrength: SessionType[] = ["strength", "strength", "long_run", "run_intervals"];
    const { map } = byDay(twoStrength, { strengthDays: [2, 5] });
    expect(map.get(2)).toBe("strength");
    expect(map.get(5)).toBe("strength");
  });

  it("never schedules on a rest day", () => {
    const { days } = byDay(BUILD, { restDays: [3, 7] });
    expect(days).not.toContain(3);
    expect(days).not.toContain(7);
  });

  it("holds all three pins at once", () => {
    const { map, days } = byDay(BUILD, { longRunDay: 7, strengthDays: [1], restDays: [3] });
    expect(map.get(7)).toBe("long_run");
    expect(map.get(1)).toBe("strength");
    expect(days).not.toContain(3);
  });

  it("gives every session a distinct day", () => {
    const { days } = byDay(BUILD, { longRunDay: 6, strengthDays: [2], restDays: [4] });
    expect(new Set(days).size).toBe(BUILD.length);
  });
});

describe("soft warn", () => {
  it("says nothing when the pins cost nothing", () => {
    // Long run Sunday, strength Monday: the hard runs still get their spacing.
    expect(layoutWeek(BUILD, { longRunDay: 7, strengthDays: [1] }).warnings).toEqual([]);
  });

  it("names the collision when a pin forces strength after a hard day", () => {
    // Only Mon-Fri available for five sessions: something has to give.
    const { warnings } = byDay(BUILD, { longRunDay: 5, restDays: [6, 7] });
    expect(warnings.join(" ")).toContain("plyometrics wants 24-48 h");
  });

  it("keeps the training week when the rest days do not fit, and says so", () => {
    const { days, warnings } = byDay(BUILD, { restDays: [4, 5, 6, 7] });
    expect(days).toHaveLength(5);
    expect(new Set(days).size).toBe(5);
    expect(warnings.join(" ")).toContain("do not fit around 4 rest days");
  });

  it("reports a long run pinned onto its own rest day, and moves it", () => {
    const { map, warnings } = byDay(BUILD, { longRunDay: 7, restDays: [7] });
    expect(map.get(7)).toBeUndefined();
    expect(warnings.join(" ")).toContain("which is also a rest day");
  });

  it("counts each warning once, however many phases produce it", () => {
    const notes = assessWeekPreferences(
      { longRunDay: 5, restDays: [6, 7] },
      { trainingDays: 5 },
    );
    expect(notes.length).toBe(new Set(notes).size);
    expect(notes.length).toBeGreaterThan(0);
  });

  it("stays silent for a week shape that works across every phase", () => {
    expect(assessWeekPreferences({ longRunDay: 7, strengthDays: [1] }, { trainingDays: 5 })).toEqual(
      [],
    );
  });
});

describe("no preferences", () => {
  it("lays the week out exactly as before", () => {
    const { warnings } = byDay(BUILD, {});
    expect(warnings).toEqual([]);
  });

  it("ignores days outside 1-7 instead of trusting them", () => {
    const { days } = byDay(BUILD, { longRunDay: 0, strengthDays: [9, -1], restDays: [12] });
    expect(days.every((d) => d >= 1 && d <= 7)).toBe(true);
  });
});
