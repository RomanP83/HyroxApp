import { describe, it, expect } from "vitest";
import {
  applyRacesToWeek,
  generatePlan,
  initialAthleteState,
  placeRaces,
  raceVolumeMultiplier,
  type AthleteProfile,
  type PlanRace,
  type SessionSlot,
} from "@/lib/engine";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";
import { planWeeksTo } from "@/lib/seasonCalendar";

// 2026-08-24 is a Monday, so plan week 1 is 24-30 August.
const MONDAY = "2026-08-24";

function slot(day: number, type: SessionSlot["session_type"], pm = false): SessionSlot {
  return {
    session_type: type,
    day_hint: day,
    day_slot: pm ? "pm" : "am",
    intensity_rpe_target: 7,
    planned_duration_min: 60,
    sort_order: day,
  };
}

const profile = {
  id: "p",
  user_id: "u",
  division: "open",
  experience_level: "advanced",
  five_k_seconds: 1320,
  station_estimates: {},
  training_days_per_week: 5,
  doubles_per_week: 1,
  weekly_km_peak: 45,
  runs_per_week: null,
  equipment_access: "full_gym",
  weaknesses: ["Sled Push"],
} as unknown as AthleteProfile;

describe("placeRaces — the calendar on the plan grid", () => {
  it("resolves a date to the plan week and weekday it falls on", () => {
    const [p] = placeRaces({
      startDate: MONDAY,
      weeksToRace: 12,
      races: [{ date: "2026-10-24", type: "Hyrox Berlin", priority: "B" }], // Saturday, week 9
    });
    expect(p.week_number).toBe(9);
    expect(p.day_hint).toBe(6);
    expect(p.plan_day).toBe(62);
  });

  it("drops races outside the plan window", () => {
    const placed = placeRaces({
      startDate: MONDAY,
      weeksToRace: 4,
      races: [
        { date: "2026-08-20", type: "Last week", priority: "B" },
        { date: "2027-01-09", type: "Next year", priority: "A" },
      ],
    });
    expect(placed).toHaveLength(0);
  });

  it("keeps the higher priority when two races share a day", () => {
    const placed = placeRaces({
      startDate: MONDAY,
      weeksToRace: 12,
      races: [
        { date: "2026-10-24", type: "Local throwdown", priority: "C" },
        { date: "2026-10-24", type: "Hyrox Berlin", priority: "A" },
      ],
    });
    expect(placed).toHaveLength(1);
    expect(placed[0].race.type).toBe("Hyrox Berlin");
  });

  it("cuts the race week's volume for a secondary race, and leaves other weeks alone", () => {
    const placed = placeRaces({
      startDate: MONDAY,
      weeksToRace: 12,
      races: [{ date: "2026-10-24", type: "Hyrox Berlin", priority: "B" }],
    });
    expect(raceVolumeMultiplier(9, placed)).toBe(0.8);
    expect(raceVolumeMultiplier(8, placed)).toBe(1);
  });
});

describe("applyRacesToWeek — what a race does to the days around it", () => {
  const week = (): SessionSlot[] => [
    slot(1, "compromised_run"),
    slot(2, "run_intervals"),
    slot(4, "long_run"),
    slot(5, "station_work"),
    slot(5, "run_easy", true),
    slot(7, "strength"),
  ];

  const placeOn = (date: string, priority: PlanRace["priority"]) =>
    placeRaces({ startDate: MONDAY, weeksToRace: 12, races: [{ date, type: "Race", priority }] });

  it("gives a secondary race three easy days in front of it and two after", () => {
    // Saturday of week 9.
    const out = applyRacesToWeek(week(), 9, placeOn("2026-10-24", "B"));
    const byDay = new Map(out.filter((s) => s.day_slot === "am").map((s) => [s.day_hint, s.session_type]));

    expect(byDay.get(6)).toBe("race_day");
    // Nothing that loads the legs in the last three days...
    expect(byDay.get(4)).toBe("run_easy");
    expect(byDay.get(5)).toBe("mobility");
    // ...and the day after is recovery, not a strength session.
    expect(byDay.get(7)).toBe("mobility");
    // The PM half of a double day in the run-in is dropped entirely.
    expect(out.some((s) => s.day_slot === "pm")).toBe(false);
  });

  it("gives a tune-up race no taper — only the day before is eased off", () => {
    const out = applyRacesToWeek(week(), 9, placeOn("2026-10-24", "C"));
    const byDay = new Map(out.filter((s) => s.day_slot === "am").map((s) => [s.day_hint, s.session_type]));

    expect(byDay.get(6)).toBe("race_day");
    expect(byDay.get(5)).toBe("mobility"); // the day before
    expect(byDay.get(4)).toBe("long_run"); // two days before: untouched
  });

  it("never leaves more than two hard days in a race week", () => {
    const hard = ["compromised_run", "run_intervals", "full_sim", "benchmark", "race_day"];
    for (const priority of ["A", "B", "C"] as const) {
      const out = applyRacesToWeek(week(), 9, placeOn("2026-10-24", priority));
      expect(out.filter((s) => hard.includes(s.session_type)).length).toBeLessThanOrEqual(2);
    }
  });

  it("reaches across the week boundary — a Saturday race eases the Monday after", () => {
    const placed = placeOn("2026-10-24", "B"); // week 9, day 6
    const next = applyRacesToWeek([slot(1, "compromised_run"), slot(3, "run_intervals")], 10, placed);
    expect(next.find((s) => s.day_hint === 1)?.session_type).toBe("run_easy"); // 2 days after
    expect(next.find((s) => s.day_hint === 3)?.session_type).toBe("run_intervals"); // untouched
  });

  it("keeps the last two days of a main race week off the legs", () => {
    const out = applyRacesToWeek(week(), 9, placeOn("2026-10-24", "A"));
    const byDay = new Map(out.filter((s) => s.day_slot === "am").map((s) => [s.day_hint, s.session_type]));
    expect(byDay.get(4)).toBe("run_easy");
    expect(byDay.get(5)).toBe("mobility");
    expect(byDay.get(6)).toBe("race_day");
    expect(byDay.get(7)).toBe("mobility");
  });
});

describe("generatePlan with a race calendar", () => {
  const state = initialAthleteState(profile);
  const races: PlanRace[] = [
    { date: "2026-09-19", type: "Club Throwdown", priority: "C" },
    { date: "2026-10-24", type: "Hyrox Berlin", priority: "B" },
    { date: "2026-11-14", type: "Hyrox Open Men", priority: "A" },
  ];
  const plan = generatePlan({
    profile,
    state,
    library: DEMO_LIBRARY,
    weeksToRace: 12,
    startDate: MONDAY,
    races,
  });
  const weeks = plan.phases.flatMap((p) => p.weeks);

  it("writes one race day per race, titled with the race itself", () => {
    const raceDays = weeks.flatMap((w) => w.sessions).filter((s) => s.session_type === "race_day");
    expect(raceDays.map((s) => s.title).sort()).toEqual([
      "Club Throwdown",
      "Hyrox Berlin",
      "Hyrox Open Men",
    ]);
  });

  it("explains the week in terms of the race that is in it", () => {
    const berlin = weeks.find((w) => w.races?.some((r) => r.type === "Hyrox Berlin"))!;
    expect(berlin.week_number).toBe(9);
    expect(berlin.weekly_goal).toContain("secondary race");
  });

  it("carries no race day at all when no calendar is passed", () => {
    const bare = generatePlan({ profile, state, library: DEMO_LIBRARY, weeksToRace: 12 });
    const raceDays = bare.phases
      .flatMap((p) => p.weeks)
      .flatMap((w) => w.sessions)
      .filter((s) => s.session_type === "race_day");
    expect(raceDays).toHaveLength(0);
  });

  it("holds the two-hard-days ceiling in every week of the plan", () => {
    const hard = ["compromised_run", "run_intervals", "full_sim", "benchmark", "race_day"];
    const overloaded = weeks
      .map((w) => ({
        week: w.week_number,
        hard: w.sessions.filter((s) => hard.includes(s.session_type)).length,
      }))
      .filter((w) => w.hard > 2);
    expect(overloaded).toEqual([]);
  });
});

describe("planWeeksTo", () => {
  it("counts on the Monday grid, so the race lands in the last plan week", () => {
    // Thursday -> the Saturday eleven weeks later is still week 12.
    expect(planWeeksTo("2026-11-14", "2026-08-27")).toBe(12);
    expect(planWeeksTo("2026-11-14", MONDAY)).toBe(12);
  });

  it("clamps to the cycle length the engine plans for", () => {
    expect(planWeeksTo("2027-11-14", MONDAY)).toBe(20);
    expect(planWeeksTo("2026-08-29", MONDAY)).toBe(4);
    expect(planWeeksTo("2026-08-29", MONDAY, 2)).toBe(2);
  });
});
