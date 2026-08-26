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
  TRANSITION_VOLUME_FACTOR,
  TRANSITION_WEEKS,
  transitionPhasePlan,
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

  it("runs at maintenance load, not at the volume a race block would", () => {
    const race = build("race", 12).weeks.filter((w) => w.phase === "base");
    const transition = build("transition", 4).weeks;
    const peak = (rows: { km: number }[]) => Math.max(...rows.map((r) => r.km));
    // Roughly the factor, allowing for the session floors underneath it.
    const ratio = peak(transition) / peak(race);
    expect(ratio).toBeLessThan(TRANSITION_VOLUME_FACTOR + 0.12);
    expect(ratio).toBeGreaterThan(TRANSITION_VOLUME_FACTOR - 0.12);
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
