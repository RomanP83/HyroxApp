import { describe, it, expect } from "vitest";
import { applyDayOverrides, assessWeekPreferences, layoutWeek } from "../micro";
import type { SessionType } from "../types";
import { weekStartOf } from "@/lib/dayOverrides";

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

describe("manual moves survive a rebase", () => {
  const week = "2026-08-24"; // a Monday

  function slotsOf(types: SessionType[]) {
    return types.map((t, i) => ({
      session_type: t,
      day_hint: i + 1,
      day_slot: "am" as const,
      intensity_rpe_target: 7,
      planned_duration_min: 60,
      sort_order: i,
    }));
  }

  it("puts a moved session back on the day it was moved to", () => {
    const out = applyDayOverrides(slotsOf(BUILD), [
      { week_start: week, session_type: "long_run", day_hint: 7, day_slot: "am" },
    ]);
    expect(out.find((s) => s.session_type === "long_run")?.day_hint).toBe(7);
  });

  it("replays a swap from the two rows it wrote, in either order", () => {
    const rows = [
      { week_start: week, session_type: "long_run" as SessionType, day_hint: 1, day_slot: "am" as const },
      { week_start: week, session_type: "compromised_run" as SessionType, day_hint: 3, day_slot: "am" as const },
    ];
    for (const order of [rows, [...rows].reverse()]) {
      const out = applyDayOverrides(slotsOf(BUILD), order);
      expect(out.find((s) => s.session_type === "long_run")?.day_hint).toBe(1);
      expect(out.find((s) => s.session_type === "compromised_run")?.day_hint).toBe(3);
      // No day ends up carrying two AM sessions.
      const am = out.filter((s) => s.day_slot === "am").map((s) => s.day_hint);
      expect(new Set(am).size).toBe(am.length);
    }
  });

  it("swaps rather than stacks when the target day is taken", () => {
    const out = applyDayOverrides(slotsOf(BUILD), [
      { week_start: week, session_type: "station_work", day_hint: 1, day_slot: "am" },
    ]);
    expect(out.find((s) => s.session_type === "station_work")?.day_hint).toBe(1);
    // Whatever was on day 1 took station_work's old day, nothing was dropped.
    expect(out).toHaveLength(BUILD.length);
    const days = out.map((s) => s.day_hint);
    expect(new Set(days).size).toBe(days.length);
  });

  it("ignores an override for a session the rebuilt week no longer has", () => {
    const out = applyDayOverrides(slotsOf(BUILD), [
      { week_start: week, session_type: "full_sim", day_hint: 6, day_slot: "am" },
    ]);
    expect(out.map((s) => s.session_type)).toEqual(
      expect.arrayContaining(BUILD),
    );
    expect(out).toHaveLength(BUILD.length);
  });

  it("leaves the week alone when there is nothing to replay", () => {
    const before = slotsOf(BUILD);
    expect(applyDayOverrides(before, [])).toEqual(before);
  });
});

describe("weekStartOf", () => {
  it("maps a plan week to the Monday it starts on", () => {
    // Plan generated on a Thursday: week 1 is the week containing it.
    expect(weekStartOf("2026-08-27T09:12:00Z", 1)).toBe("2026-08-24");
    expect(weekStartOf("2026-08-27T09:12:00Z", 4)).toBe("2026-09-14");
    // Generated on a Sunday — still that week's Monday, not the next one.
    expect(weekStartOf("2026-08-30T22:00:00Z", 1)).toBe("2026-08-24");
  });

  it("is what makes an override survive renumbering", () => {
    // A plan generated 3 weeks later: its week 1 is the old plan's week 4.
    expect(weekStartOf("2026-08-27T09:12:00Z", 4)).toBe(weekStartOf("2026-09-17T08:00:00Z", 1));
  });
});

describe("which Monday an override is filed under", () => {
  // The bug: the move endpoint anchored an override on plans.generated_at while
  // generatePlan replays it against the grid derived from plans.starts_on. Those
  // are the same Monday only when the plan was generated ON a Monday — and
  // starts_on defaults to NEXT Monday, so in the normal case every recorded move
  // was filed a week early, matched nothing on the next rebase, and vanished.
  const generatedAt = "2026-03-04T18:20:00Z"; // a Wednesday
  const startsOn = "2026-03-09"; // nextMonday(generatedAt)

  it("is a different Monday for the two anchors whenever a plan is not built on a Monday", () => {
    expect(weekStartOf(generatedAt, 1)).toBe("2026-03-02");
    expect(weekStartOf(startsOn, 1)).toBe("2026-03-09");
    expect(weekStartOf(generatedAt, 1)).not.toBe(weekStartOf(startsOn, 1));
  });

  it("only replays when the override was filed on the grid the plan is built on", () => {
    const slots = BUILD.map((t, i) => ({
      session_type: t,
      day_hint: i + 1,
      day_slot: "am" as const,
      intensity_rpe_target: 7,
      planned_duration_min: 60,
      sort_order: i,
    }));
    const onStartsOn = {
      week_start: weekStartOf(startsOn, 3),
      session_type: "strength" as SessionType,
      day_hint: 5,
      day_slot: "am" as const,
    };
    // The plan's own week 3 Monday — what generatePlan looks the override up by.
    const planWeek3 = weekStartOf(startsOn, 3);
    const replayed = applyDayOverrides(
      slots,
      [onStartsOn].filter((o) => o.week_start === planWeek3),
    );
    expect(replayed.find((s) => s.session_type === "strength")?.day_hint).toBe(5);

    // The same move, filed the way it used to be: it never matches, so the
    // athlete's decision is silently dropped.
    const onGeneratedAt = { ...onStartsOn, week_start: weekStartOf(generatedAt, 3) };
    const dropped = applyDayOverrides(
      slots,
      [onGeneratedAt].filter((o) => o.week_start === planWeek3),
    );
    expect(dropped.find((s) => s.session_type === "strength")?.day_hint).not.toBe(5);
  });
});
