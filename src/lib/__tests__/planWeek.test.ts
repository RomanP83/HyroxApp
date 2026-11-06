// The current week is derived, so this is where "which week am I in" is
// actually decided. It replaced a stored flag that nothing ever advanced.
import { describe, it, expect } from "vitest";
import {
  currentWeekNumber,
  dayDateOf,
  nextMonday,
  planIsRunning,
  raceIsBehind,
  weekStartOf,
} from "../planWeek";
import { fmtDayDate } from "../format";
import { planWeeksTo } from "../seasonCalendar";
import { splitPhases } from "@/lib/engine";

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

describe("a plan whose race is behind it", () => {
  // The concrete failure: planWeeksTo counts weeks TO the race and clamps to
  // its floor, so a finished plan rebased the week after the race came back as
  // two taper weeks aimed at a day that was over. rebasePlan refuses now, and
  // this is the arithmetic that says why it had to.
  it("would produce a nonsense length if it were rebased", () => {
    expect(planWeeksTo("2026-02-23", "2026-03-02", 2)).toBe(2);
    expect(planWeeksTo("2025-12-01", "2026-03-02", 2)).toBe(2);
    // Two weeks is all taper: a block with no base, no build and no peak.
    expect(splitPhases(2).map((p) => p.phase_type)).toEqual(["taper"]);
  });

  it("counts race day itself as still ahead", () => {
    // You train on race morning; the plan closes the day after.
    expect(raceIsBehind("2026-05-24", "2026-05-24")).toBe(false);
    expect(raceIsBehind("2026-05-24", "2026-05-25")).toBe(true);
  });
});

describe("the calendar date behind a plan weekday", () => {
  // Week 1 starts Monday 2 March 2026.
  const start = "2026-03-02";

  it("turns a week number and a weekday into the day it actually is", () => {
    expect(dayDateOf(weekStartOf(start, 1), 1)).toBe("2026-03-02");
    expect(dayDateOf(weekStartOf(start, 1), 7)).toBe("2026-03-08");
    expect(dayDateOf(weekStartOf(start, 2), 1)).toBe("2026-03-09");
    expect(dayDateOf(weekStartOf(start, 12), 3)).toBe("2026-05-20");
  });

  it("crosses a month and a year boundary without drifting", () => {
    expect(dayDateOf("2026-12-28", 5)).toBe("2027-01-01");
    expect(dayDateOf("2026-03-30", 3)).toBe("2026-04-01");
  });

  it("survives a nonsense weekday rather than producing a wrong date", () => {
    expect(dayDateOf(weekStartOf(start, 1), 0)).toBe("2026-03-02");
    expect(dayDateOf(weekStartOf(start, 1), 9)).toBe("2026-03-08");
  });

  it("formats a date the same way on the server and in the browser", () => {
    // Hand-formatted rather than locale-formatted: a locale that differs
    // between the two renders is a hydration mismatch on every card.
    expect(fmtDayDate("2026-03-02")).toBe("2 Mar");
    expect(fmtDayDate("2026-12-31")).toBe("31 Dec");
    expect(fmtDayDate(null)).toBe("");
    expect(fmtDayDate("not a date")).toBe("");
  });
});
