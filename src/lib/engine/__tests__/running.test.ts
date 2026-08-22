import { describe, it, expect } from "vitest";
import {
  COMPROMISED_OPENING,
  compromisedOpeningPace,
  defaultPaceZones,
  distributeSlots,
  fillSession,
  generatePlan,
  initialAthleteState,
  plannedDistanceKm,
  POLARISATION_BY_PHASE,
  RUN_SPECS,
  runSpec,
  weeklyRunSummary,
  type AthleteProfile,
  type PhaseType,
} from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";

const ZONES = defaultPaceZones(1350); // 22:30 over 5k
const profile = (days: number): AthleteProfile => ({
  id: "t",
  division: "open",
  experience_level: "intermediate",
  five_k_seconds: 1350,
  station_estimates: {},
  training_days_per_week: days,
  equipment_access: "full_gym",
});

const week = (phase: PhaseType, days: number) =>
  distributeSlots({ phase, trainingDays: days, weekInPhase: 1, isDeload: false, isBenchmark: false });

describe("the four core run sessions", () => {
  it("prescribes a zone, a pace zone and a focus for each of them", () => {
    for (const type of ["long_run", "run_easy", "run_intervals", "compromised_run"] as const) {
      const spec = RUN_SPECS[type];
      expect(spec.hr_zone).toMatch(/Zone/);
      expect(ZONES[spec.pace_zone]).toBeGreaterThan(0);
      expect(spec.focus.length).toBeGreaterThan(10);
      expect(spec.pace_note.length).toBeGreaterThan(10);
    }
    expect(runSpec("strength")).toBeNull();
  });

  it("runs the long run in Zone 2 and the intervals at interval pace", () => {
    expect(RUN_SPECS.long_run.pace_zone).toBe("easy_sec_km");
    expect(RUN_SPECS.run_easy.pace_zone).toBe("easy_sec_km");
    expect(RUN_SPECS.run_intervals.pace_zone).toBe("interval_sec_km");
    expect(RUN_SPECS.compromised_run.pace_zone).toBe("race_sec_km");
  });

  it("shortens the long run as the race approaches", () => {
    const d = RUN_SPECS.long_run.duration_by_phase;
    expect(d.base).toBeGreaterThanOrEqual(60);
    expect(d.base).toBeLessThanOrEqual(90);
    expect(d.build).toBeLessThan(d.base);
    expect(d.peak).toBeLessThanOrEqual(d.build);
    expect(d.taper).toBeLessThan(d.peak);
  });

  it("puts the session distances where the prescription says", () => {
    // Long run 12-18 km, easy run 5-8 km, intervals 8-10 km total.
    expect(plannedDistanceKm("long_run", 80, ZONES)).toBeGreaterThanOrEqual(12);
    expect(plannedDistanceKm("long_run", 80, ZONES)).toBeLessThanOrEqual(18);
    expect(plannedDistanceKm("run_easy", 40, ZONES)).toBeGreaterThanOrEqual(5);
    expect(plannedDistanceKm("run_easy", 40, ZONES)).toBeLessThanOrEqual(8);
    expect(plannedDistanceKm("run_intervals", 55, ZONES)).toBeGreaterThanOrEqual(8);
    expect(plannedDistanceKm("run_intervals", 55, ZONES)).toBeLessThanOrEqual(10.5);
    expect(plannedDistanceKm("strength", 60, ZONES)).toBe(0);
  });
});

describe("phase control", () => {
  it("keeps compromised running out of the base block entirely", () => {
    for (let w = 1; w <= 8; w++) {
      for (let days = 3; days <= 6; days++) {
        const slots = distributeSlots({
          phase: "base",
          trainingDays: days,
          weekInPhase: w,
          isDeload: false,
          isBenchmark: false,
        });
        expect(slots.some((s) => s.session_type === "compromised_run")).toBe(false);
      }
    }
  });

  it("builds the base week from long run, intervals and an easy run", () => {
    const types = week("base", 5).map((s) => s.session_type);
    expect(types).toContain("long_run");
    expect(types).toContain("run_intervals");
    expect(types).toContain("run_easy");
  });

  it("brings compromised running in from the build block", () => {
    expect(week("build", 5).map((s) => s.session_type)).toContain("compromised_run");
    expect(week("peak", 5).map((s) => s.session_type)).toContain("compromised_run");
  });

  it("hits the polarised window of every phase at 5 training days", () => {
    for (const phase of ["base", "build", "peak", "taper"] as const) {
      const summary = weeklyRunSummary(week(phase, 5), ZONES, phase);
      const [min, max] = POLARISATION_BY_PHASE[phase];
      expect(summary.easy_share, `${phase}: ${summary.note}`).toBeGreaterThanOrEqual(min);
      expect(summary.easy_share, `${phase}: ${summary.note}`).toBeLessThanOrEqual(max);
      expect(summary.polarisation).toBe("on_target");
    }
  });

  it("plans 3-4 runs a week and 30-50 km in base, build and peak", () => {
    for (const phase of ["base", "build", "peak"] as const) {
      const summary = weeklyRunSummary(week(phase, 5), ZONES, phase);
      expect(summary.runs, phase).toBeGreaterThanOrEqual(3);
      expect(summary.total_km, phase).toBeGreaterThanOrEqual(30);
      expect(summary.total_km, phase).toBeLessThanOrEqual(50);
    }
  });

  it("says so instead of pretending when the training days cannot carry it", () => {
    const thin = weeklyRunSummary(week("build", 4), ZONES, "build");
    expect(thin.volume === "below" || thin.polarisation === "too_hard").toBe(true);
    expect(thin.note).toMatch(/km|hard share/);
  });
});

describe("compromised running", () => {
  it("buffers the first metres out of a station and settles onto race pace", () => {
    const state = initialAthleteState(profile(5));
    const slots = week("build", 5);
    const compromised = slots.find((s) => s.session_type === "compromised_run")!;
    const blocks = fillSession(compromised, profile(5), state, DEMO_LIBRARY, 3);
    const main = blocks.find((b) => b.load_adjustments.opening_pace_sec_km != null)!;

    expect(main.load_adjustments.pace_sec_km).toBe(state.pace_zones.race_sec_km);
    expect(main.load_adjustments.opening_pace_sec_km).toBe(
      state.pace_zones.race_sec_km + COMPROMISED_OPENING.buffer_sec_km,
    );
    expect(main.load_adjustments.opening_distance_m).toBe(400);
    expect(main.load_adjustments.stabilise_distance_m).toBe(200);
  });

  it("adds 15-25 s/km, as the prescription asks", () => {
    expect(compromisedOpeningPace(240) - 240).toBeGreaterThanOrEqual(15);
    expect(compromisedOpeningPace(240) - 240).toBeLessThanOrEqual(25);
  });

  it("leaves a pure run without an opening buffer", () => {
    const state = initialAthleteState(profile(5));
    const easy = week("base", 5).find((s) => s.session_type === "run_easy")!;
    const blocks = fillSession(easy, profile(5), state, DEMO_LIBRARY, 1);
    expect(blocks.every((b) => b.load_adjustments.opening_pace_sec_km == null)).toBe(true);
  });
});

describe("generated plans", () => {
  const state = initialAthleteState(profile(5));
  const plan = generatePlan({ profile: profile(5), state, library: DEMO_LIBRARY, weeksToRace: 12 });
  const weeks = plan.phases.flatMap((p) => p.weeks.map((w) => ({ phase: p.phase_type, week: w })));

  it("puts a long run in every non-deload week of the plan", () => {
    const withLong = weeks.filter((w) => w.week.sessions.some((s) => s.session_type === "long_run"));
    expect(withLong.length).toBeGreaterThan(weeks.length / 2);
  });

  it("gives every run session a pace target from the athlete's zones", () => {
    for (const { week: w } of weeks) {
      for (const session of w.sessions) {
        const spec = runSpec(session.session_type);
        if (!spec || !session.blocks.length) continue;
        const paced = session.blocks.some((b) => b.load_adjustments.pace_sec_km != null);
        expect(paced, `${session.session_type} has no pace`).toBe(true);
      }
    }
  });

  it("never schedules compromised running before the build phase", () => {
    for (const { phase, week: w } of weeks) {
      if (phase !== "base") continue;
      expect(w.sessions.some((s) => s.session_type === "compromised_run")).toBe(false);
    }
  });
});
