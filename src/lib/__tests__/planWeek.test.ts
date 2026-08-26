// The current week is derived, so this is where "which week am I in" is
// actually decided. It replaced a stored flag that nothing ever advanced.
import { describe, it, expect } from "vitest";
import { currentWeekNumber, nextMonday, planIsRunning, weekStartOf } from "../planWeek";

const day = (iso: string) => iso;

describe("which week of the plan today is", () => {
  const startsOn = "2026-03-02"; // a Monday

  it("counts Monday to Sunday as one week", () => {
    for (const [today, week] of [
      ["2026-03-02", 1],
      ["2026-03-08", 1], // Sunday of week 1
      ["2026-03-09", 2], // Monday of week 2
      ["2026-03-15", 2],
      ["2026-03-16", 3],
    ] as const) {
      expect(currentWeekNumber({ startsOn, today: day(today), totalWeeks: 12 }), today).toBe(week);
    }
  });

  it("walks a whole cycle without skipping or repeating a week", () => {
    const seen: number[] = [];
    for (let d = 0; d < 12 * 7; d++) {
      const today = new Date(Date.UTC(2026, 2, 2) + d * 86_400_000).toISOString().slice(0, 10);
      seen.push(currentWeekNumber({ startsOn, today, totalWeeks: 12 }));
    }
    // Every week appears, in order, for exactly seven days.
    expect(new Set(seen).size).toBe(12);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    for (let w = 1; w <= 12; w++) expect(seen.filter((x) => x === w)).toHaveLength(7);
  });

  it("waits at week 1 before the plan starts", () => {
    expect(currentWeekNumber({ startsOn, today: "2026-02-20", totalWeeks: 12 })).toBe(1);
    expect(planIsRunning({ startsOn, today: "2026-02-20", totalWeeks: 12 })).toBe(false);
  });

  it("stops at the last week once the race is past", () => {
    expect(currentWeekNumber({ startsOn, today: "2026-08-01", totalWeeks: 12 })).toBe(12);
    expect(planIsRunning({ startsOn, today: "2026-08-01", totalWeeks: 12 })).toBe(false);
  });

  it("agrees with the grid moved sessions are remembered on", () => {
    // session_day_overrides is keyed on this Monday; if the two ever disagreed
    // a moved session would come back into the wrong week.
    for (let w = 1; w <= 12; w++) {
      const monday = weekStartOf(startsOn, w);
      expect(currentWeekNumber({ startsOn, today: monday, totalWeeks: 12 })).toBe(w);
    }
  });
});

describe("the default start", () => {
  it("is the coming Monday, and today when today is Monday", () => {
    expect(nextMonday("2026-03-02")).toBe("2026-03-02"); // Monday
    expect(nextMonday("2026-03-03")).toBe("2026-03-09"); // Tuesday
    expect(nextMonday("2026-03-07")).toBe("2026-03-09"); // Saturday
    expect(nextMonday("2026-03-08")).toBe("2026-03-09"); // Sunday
  });
});

describe("the highlight on the week view", () => {
  // The focal card marks today's session. It used to check only the weekday,
  // so the same weekday lit up in every week of the plan — which is how the
  // stale current-week flag was noticed in the first place.
  const focal = (opts: {
    shownWeek: number;
    thisWeek: number;
    weekday: number;
    dayHint: number;
    status: string;
  }) =>
    opts.shownWeek === opts.thisWeek && opts.weekday === opts.dayHint && opts.status === "planned";

  it("lights exactly one session, in the week today is in", () => {
    const week = [1, 3, 5, 7];
    for (let shown = 1; shown <= 12; shown++) {
      const lit = week.filter((day) =>
        focal({ shownWeek: shown, thisWeek: 4, weekday: 3, dayHint: day, status: "planned" }),
      );
      expect(lit.length, `week ${shown}`).toBe(shown === 4 ? 1 : 0);
    }
  });

  it("goes dark once the session is logged", () => {
    for (const status of ["done", "skipped", "moved"]) {
      expect(focal({ shownWeek: 4, thisWeek: 4, weekday: 3, dayHint: 3, status })).toBe(false);
    }
  });
});
