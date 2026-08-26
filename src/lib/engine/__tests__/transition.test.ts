// The block between goals, and the plan that is over.
//
// Every plan the engine builds is periodised towards a race. That left two
// holes the week after one: the finished plan kept showing its taper week, and
// the nightly rebase — which fires after seven days of inactivity, exactly
// what the week after a race looks like — counted weeks TO a date in the past,
// clamped to its floor, and handed back a two-week taper aimed at a day that
// was over.
import { describe, it, expect } from "vitest";
import {
  generatePlan,
  initialAthleteState,
  splitPhases,
  TRANSITION_MODULES,
  TRANSITION_WEEKS,
  transitionIsDeload,
  transitionModuleFor,
  transitionPhasePlan,
  transitionWeeksFor,
  weeklyRunSummary,
  type AthleteProfile,
} from "../index";
import { raceIsBehind } from "@/lib/planWeek";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";

const profile = (over: Partial<AthleteProfile> = {}): AthleteProfile => ({
  id: "t",
  division: "pro",
  experience_level: "advanced",
  five_k_seconds: 1200,
  station_estimates: {},
  training_days_per_week: 5,
  doubles_per_week: 1,
  equipment_access: "full_gym",
  weekly_km_peak: 50,
  ...over,
});

function build(mode: "race" | "transition", weeks: number) {
  const p = profile();
  const state = initialAthleteState(p);
  const plan = generatePlan({
    profile: p,
    state,
    library: DEMO_LIBRARY,
    weeksToRace: weeks,
    mode,
    startDate: "2026-03-02",
  });
  return {
    plan,
    weeks: plan.phases.flatMap((ph) =>
      ph.weeks.map((w) => ({
        phase: ph.phase_type,
        week: w,
        km: weeklyRunSummary(w.sessions, state.pace_zones, ph.phase_type).total_km,
      })),
    ),
  };
}

describe("a block with no race in front of it", () => {
  it("is one base phase, not a cycle that ends in a taper", () => {
    const phases = transitionPhasePlan(TRANSITION_WEEKS);
    expect(phases).toHaveLength(1);
    expect(phases[0].phase_type).toBe("base");
    expect(phases[0].end_week).toBe(TRANSITION_WEEKS);
    // Which is what a four-week RACE block would not be: there the runway is
    // so short that everything collapses into peak and taper.
    expect(splitPhases(4).map((p) => p.phase_type)).toContain("taper");
  });

  it("carries no benchmark and no simulation — there is nothing to test for", () => {
    const { weeks } = build("transition", 4);
    for (const { week } of weeks) {
      expect(week.is_benchmark_week, `W${week.week_number}`).toBe(false);
      expect(week.sessions.some((s) => s.session_type === "full_sim")).toBe(false);
      expect(week.sessions.some((s) => s.session_type === "benchmark")).toBe(false);
    }
  });

  it("climbs from nothing to near-normal across its modules", () => {
    const km = (week: number) =>
      build("transition", 10).weeks.find((w) => w.week.week_number === week)!.km;
    expect(km(1), "reset").toBe(0);
    expect(km(2)).toBeGreaterThan(0);
    expect(km(3)).toBeGreaterThan(km(2));
    expect(km(4)).toBeGreaterThan(km(3));
  });

  it("gives week one complete rest, then movement that does not land", () => {
    const first = build("transition", 4).weeks[0].week;
    // Days 1-3 carry nothing at all; the rest is mobility. No running, no
    // landings, no lifting — the nervous system is what is recovering.
    expect(first.sessions.every((s) => s.session_type === "mobility")).toBe(true);
    expect(Math.min(...first.sessions.map((s) => s.day_hint))).toBeGreaterThanOrEqual(4);
    expect(Math.max(...first.sessions.map((s) => s.intensity_rpe_target))).toBeLessThanOrEqual(3);
  });

  it("keeps the re-introduction week short and aerobic", () => {
    const second = build("transition", 4).weeks[1].week;
    const types = second.sessions.map((s) => s.session_type);
    // 2-3 short base runs, 2 light full-body strength sessions, erg technique.
    expect(types).not.toContain("long_run");
    expect(types).not.toContain("run_intervals");
    expect(types.filter((t) => t === "strength").length).toBe(2);
    expect(types).toContain("station_work");
    expect(Math.max(...second.sessions.map((s) => s.intensity_rpe_target))).toBeLessThanOrEqual(
      TRANSITION_MODULES.reintroduction.rpe_cap,
    );
  });

  it("never prescribes compromised running anywhere in the block", () => {
    // Race specificity is what the next macrocycle is for. This block exists
    // to arrive at it intact.
    for (const weeks of [2, 4, 12]) {
      for (const { week } of build("transition", weeks).weeks) {
        expect(
          week.sessions.some((s) => s.session_type === "compromised_run"),
          `${weeks}-week block, W${week.week_number}`,
        ).toBe(false);
      }
    }
  });

  it("runs the off-season in four-week cycles: three loading, one deload", () => {
    expect(transitionModuleFor(1)).toBe("reset");
    expect(transitionModuleFor(2)).toBe("reintroduction");
    expect(transitionModuleFor(3)).toBe("reload");
    expect(transitionModuleFor(4)).toBe("offseason");
    expect(transitionModuleFor(20)).toBe("offseason");
    // The off-season starts in week 4, so its fourth week is plan week 7.
    expect([1, 2, 3, 4, 5, 6].map(transitionIsDeload)).toEqual([false, false, false, false, false, false]);
    expect(transitionIsDeload(7)).toBe(true);
    expect(transitionIsDeload(11)).toBe(true);
  });

  it("is as long as the room before the next race leaves it", () => {
    // The race block wants its full runway; the off-season fills what is left.
    expect(transitionWeeksFor(null)).toBe(TRANSITION_WEEKS);
    expect(transitionWeeksFor(32)).toBe(16);
    expect(transitionWeeksFor(20)).toBe(4);
    // Too little room: the block collapses to its first modules and the race
    // block starts almost at once — but never to nothing.
    expect(transitionWeeksFor(12)).toBe(1);
    expect(transitionWeeksFor(3)).toBe(1);
  });

  it("still trains the whole sport", () => {
    // Maintenance is not "some easy runs": the strength and the stations are
    // exactly what would decay over four unstructured weeks.
    const types = new Set(
      build("transition", 4).weeks.flatMap(({ week }) => week.sessions.map((s) => s.session_type)),
    );
    for (const wanted of ["long_run", "strength", "station_work"]) {
      expect(types.has(wanted as never), wanted).toBe(true);
    }
  });
});

describe("a race that has been and gone", () => {
  it("is recognised from the date alone", () => {
    expect(raceIsBehind("2026-03-01", "2026-03-02")).toBe(true);
    expect(raceIsBehind("2026-03-02", "2026-03-02")).toBe(false); // race day itself
    expect(raceIsBehind("2026-03-03", "2026-03-02")).toBe(false);
  });
});
