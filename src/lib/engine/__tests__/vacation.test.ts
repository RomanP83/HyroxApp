import { describe, it, expect } from "vitest";
import {
  applyVacationToWeek,
  generatePlan,
  initialAthleteState,
  isReentryWeek,
  normaliseVacations,
  vacationDaysOfWeek,
  VACATION,
  type AthleteProfile,
  type GeneratedPlan,
  type SessionSlot,
  type Vacation,
} from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";

const HARD = ["run_intervals", "compromised_run", "full_sim", "benchmark"];

const slot = (session_type: SessionSlot["session_type"], day_hint: number, extra: Partial<SessionSlot> = {}): SessionSlot => ({
  session_type,
  day_hint,
  day_slot: "am",
  intensity_rpe_target: 7,
  planned_duration_min: 60,
  sort_order: 0,
  ...extra,
});

const WEEK: SessionSlot[] = [
  slot("strength", 1),
  slot("run_easy", 1, { day_slot: "pm", intensity_rpe_target: 4, planned_duration_min: 35 }),
  slot("run_intervals", 2),
  slot("strength", 3),
  slot("station_work", 4),
  slot("compromised_run", 6),
  slot("long_run", 7, { intensity_rpe_target: 5, planned_duration_min: 95 }),
];

const allDays = (mode: "maintain" | "off") => new Map([1, 2, 3, 4, 5, 6, 7].map((d) => [d, mode] as const));

describe("vacation days of a week", () => {
  it("maps dates onto weekdays, and off wins over maintain", () => {
    const v: Vacation[] = [
      { start: "2026-11-27", end: "2026-12-02", mode: "maintain" }, // Fri → Wed
      { start: "2026-12-01", end: "2026-12-01", mode: "off" }, // Tue
    ];
    const days = vacationDaysOfWeek("2026-11-30", v);
    expect([...days.entries()]).toEqual([
      [1, "maintain"],
      [2, "off"],
      [3, "maintain"],
    ]);
  });

  it("drops reversed or malformed entries", () => {
    expect(normaliseVacations([{ start: "2026-12-10", end: "2026-12-01", mode: "maintain" }])).toEqual([]);
    expect(normaliseVacations([{ start: "x", end: "2026-12-01", mode: "off" }])).toEqual([]);
  });

  it("finds the week you come back in, after five days or more", () => {
    const long: Vacation[] = [{ start: "2026-11-29", end: "2026-12-14", mode: "maintain" }];
    expect(isReentryWeek("2026-12-14", long)).toBe(true); // back on Tue 15.12.
    expect(isReentryWeek("2026-12-07", long)).toBe(false);
    const short: Vacation[] = [{ start: "2026-12-01", end: "2026-12-03", mode: "off" }];
    expect(isReentryWeek("2026-11-30", short)).toBe(false);
  });
});

describe("applyVacationToWeek", () => {
  it("off: nothing on vacation days, everything else untouched", () => {
    const days = new Map([[1, "off"], [2, "off"]] as const);
    const out = applyVacationToWeek(WEEK, new Map(days));
    expect(out.map((s) => [s.session_type, s.day_hint])).toEqual([
      ["strength", 3],
      ["station_work", 4],
      ["compromised_run", 6],
      ["long_run", 7],
    ]);
    expect(out.every((s) => !s.vacation)).toBe(true);
  });

  it("maintain: easy runs, one quality run, bodyweight — no stations, sled or game days", () => {
    const out = applyVacationToWeek(WEEK, allDays("maintain"));
    const types = out.map((s) => s.session_type);
    expect(types).not.toContain("station_work");
    expect(types).not.toContain("compromised_run");
    expect(types).not.toContain("strength");
    expect(types.filter((t) => t === "run_intervals")).toHaveLength(1);
    expect(types.filter((t) => t === "run_easy" || t === "long_run").length).toBeLessThanOrEqual(VACATION.max_runs);
    expect(out.every((s) => s.vacation === "maintain" && s.day_slot === "am")).toBe(true);
    expect(out.find((s) => s.session_type === "run_intervals")!.intensity_rpe_target).toBeLessThanOrEqual(VACATION.quality_rpe_max);
    const long = out.find((s) => s.session_type === "long_run");
    if (long) expect(long.planned_duration_min).toBeLessThanOrEqual(VACATION.long_run_max_min);
    expect(out.filter((s) => s.session_type === "mobility").every((s) => s.planned_duration_min === VACATION.bodyweight_min)).toBe(true);
  });

  it("keeps a race day whatever the vacation says", () => {
    const out = applyVacationToWeek([slot("race_day", 6)], allDays("off"));
    expect(out.map((s) => s.session_type)).toEqual(["race_day"]);
  });
});

describe("planning around a vacation", () => {
  const profile = {
    id: "p",
    division: "open",
    experience_level: "elite",
    five_k_seconds: 1150,
    station_estimates: {},
    training_days_per_week: 6,
    equipment_access: "full_gym",
    workout_collection: "verona",
  } as AthleteProfile;
  // Plan built on Mon 05.10.2026 for 17 weeks → race week of 25.01.2027.
  const plan = (vacations?: Vacation[]): GeneratedPlan =>
    generatePlan({
      profile,
      state: initialAthleteState(profile),
      library: DEMO_LIBRARY,
      weeksToRace: 17,
      startDate: "2026-10-05",
      vacations,
    });
  const weeks = (pl: GeneratedPlan) => pl.phases.flatMap((p) => p.weeks.map((w) => ({ ...w, phase: p.phase_type })));
  const monday = (w: number) => new Date(Date.parse("2026-10-05T00:00:00Z") + (w - 1) * 7 * 86_400_000).toISOString().slice(0, 10);
  const holiday: Vacation[] = [{ start: "2026-11-29", end: "2026-12-14", mode: "maintain" }];

  it("is the same plan without vacations", () => {
    expect(plan([])).toEqual(plan());
  });

  it("turns the vacation days into the travel version and says so", () => {
    const pl = plan(holiday);
    for (const w of weeks(pl)) {
      const days = vacationDaysOfWeek(monday(w.week_number), holiday);
      for (const s of w.sessions) {
        if (!days.has(s.day_hint)) continue;
        expect(s.title.startsWith("Vacation · "), `${w.week_number}/${s.title}`).toBe(true);
        expect(["station_work", "compromised_run", "full_sim", "benchmark", "strength"]).not.toContain(s.session_type);
        expect(s.day_slot).toBe("am");
        expect(JSON.stringify(s.blocks)).not.toMatch(/sled|Sled/);
      }
      if (days.size) expect(w.weekly_goal).toMatch(/^Vacation 29\.11\.–14\.12\./);
    }
  });

  it("keeps the simulation and the benchmarks out of the vacation", () => {
    const pl = plan(holiday);
    for (const w of weeks(pl)) {
      const away = vacationDaysOfWeek(monday(w.week_number), holiday).size > 0;
      if (away) {
        expect(w.is_benchmark_week, `week ${w.week_number}`).toBe(false);
        expect(w.sessions.some((s) => s.session_type === "full_sim")).toBe(false);
      }
    }
    expect(weeks(pl).some((w) => w.sessions.some((s) => s.session_type === "full_sim"))).toBe(true);
  });

  it("makes the week you come back in a lighter re-entry week", () => {
    const pl = plan(holiday);
    const back = weeks(pl).find((w) => w.week_number === 11)!; // Mon 14.12.
    expect(back.is_deload).toBe(true);
    // Sunday 13.12. is the last vacation day of week 10; the 14th is in week 11.
    expect(back.sessions.filter((s) => HARD.includes(s.session_type)).length).toBeLessThanOrEqual(2);
  });

  it("is deterministic", () => {
    expect(plan(holiday)).toEqual(plan(holiday));
  });
});

describe("vacationDaysBetween", () => {
  it("counts only vacation days after the last session", async () => {
    const { vacationDaysBetween } = await import("../vacation");
    const v: Vacation[] = [{ start: "2026-12-01", end: "2026-12-10", mode: "maintain" }];
    const from = Date.parse("2026-11-30T18:00:00Z"); // last session
    const to = Date.parse("2026-12-11T03:00:00Z"); // nightly cron
    expect(vacationDaysBetween(from, to, v)).toBe(10);
    expect(vacationDaysBetween(from, to, [])).toBe(0);
  });
});
