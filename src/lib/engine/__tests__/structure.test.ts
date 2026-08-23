import { describe, it, expect } from "vitest";
import {
  capHardSessions,
  defaultPaceZones,
  frequencyAdvice,
  generatePlan,
  initialAthleteState,
  MAX_HARD_SESSIONS_PER_WEEK,
  POLARISATION_BY_PHASE,
  splitPhases,
  weeklyRunSummary,
  type AthleteProfile,
  type SessionType,
} from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";

const HARD: SessionType[] = ["run_intervals", "compromised_run", "full_sim", "benchmark"];
const profile = (over: Partial<AthleteProfile> = {}): AthleteProfile => ({
  id: "t",
  division: "open",
  experience_level: "intermediate",
  five_k_seconds: 1350,
  station_estimates: {},
  training_days_per_week: 5,
  equipment_access: "full_gym",
  doubles_per_week: 1,
  ...over,
});

function plan(over: Partial<AthleteProfile> = {}, weeks = 12) {
  const p = profile(over);
  const state = initialAthleteState(p);
  const generated = generatePlan({ profile: p, state, library: DEMO_LIBRARY, weeksToRace: weeks });
  return {
    state,
    weeks: generated.phases.flatMap((ph) => ph.weeks.map((w) => ({ phase: ph.phase_type, w }))),
  };
}

describe("the 12-week standard cycle", () => {
  it("splits 4 base / 4 build / 3 peak / 1 taper", () => {
    expect(splitPhases(12)).toEqual([
      { phase_type: "base", weeks: 4 },
      { phase_type: "build", weeks: 4 },
      { phase_type: "peak", weeks: 3 },
      { phase_type: "taper", weeks: 1 },
    ]);
  });
});

describe("two hard days a week, no more", () => {
  it("holds across every week of a plan, at any training frequency", () => {
    for (const days of [3, 4, 5, 6]) {
      for (const { w } of plan({ training_days_per_week: days }).weeks) {
        const hard = w.sessions.filter((s) => HARD.includes(s.session_type));
        expect(hard.length, `week ${w.week_number} at ${days} days`).toBeLessThanOrEqual(
          MAX_HARD_SESSIONS_PER_WEEK,
        );
      }
    }
  });

  it("gives the slot back to a session the phase would have used anyway", () => {
    const capped = capHardSessions(
      ["benchmark", "compromised_run", "run_intervals", "strength"],
      "build",
    );
    expect(capped.filter((t) => HARD.includes(t))).toHaveLength(2);
    expect(capped).toContain("strength");
    expect(capped.length).toBe(4); // nothing lost, only swapped
  });

  it("leaves a week that is already inside the ceiling untouched", () => {
    const week: SessionType[] = ["compromised_run", "run_intervals", "long_run", "strength"];
    expect(capHardSessions(week, "build")).toEqual(week);
  });
});

describe("full race simulations", () => {
  it("happens exactly once per cycle, not once per peak week", () => {
    for (const weeks of [10, 12, 16]) {
      const sims = plan({}, weeks).weeks.filter((x) =>
        x.w.sessions.some((s) => s.session_type === "full_sim"),
      );
      expect(sims.length, `${weeks}-week plan`).toBe(1);
    }
  });

  it("sits about three weeks out — late enough to rehearse, early enough to absorb", () => {
    const all = plan({}, 12).weeks;
    const sim = all.find((x) => x.w.sessions.some((s) => s.session_type === "full_sim"))!;
    expect(sim.phase).toBe("peak");
    expect(12 - sim.w.week_number).toBeGreaterThanOrEqual(1);
    expect(12 - sim.w.week_number).toBeLessThanOrEqual(3);
  });
});

describe("strength through the whole cycle", () => {
  it("keeps a strength session in every phase", () => {
    const byPhase = new Map<string, boolean>();
    for (const { phase, w } of plan().weeks) {
      if (w.sessions.some((s) => s.session_type === "strength")) byPhase.set(phase, true);
    }
    for (const phase of ["base", "build", "peak", "taper"]) {
      expect(byPhase.get(phase), `${phase} has no strength session`).toBe(true);
    }
  });

  it("builds it on heavy compound lifts in the low single digits", () => {
    const maxStrength = plan()
      .weeks.flatMap((x) => x.w.sessions.flatMap((s) => s.blocks))
      .find((b) => b.load_adjustments.variant_name === "Maximal Strength");
    expect(maxStrength).toBeDefined();
    const reps = (maxStrength!.content as { reps?: number }[]).map((c) => c.reps);
    expect(Math.min(...(reps.filter(Boolean) as number[]))).toBeLessThanOrEqual(3);
  });

  it("primes rather than loads in race week", () => {
    const taper = plan().weeks.find((x) => x.phase === "taper")!;
    const strength = taper.w.sessions.find((s) => s.session_type === "strength");
    const main = strength?.blocks.find((b) => b.block_type === "main");
    expect(main?.load_adjustments.variant_name).toBe("Power Primer");
  });
});

describe("the must-dos that need a rested athlete", () => {
  const blocks = plan()
    .weeks.flatMap((x) => x.w.sessions.filter((s) => s.session_type === "strength"))
    .flatMap((s) => s.blocks.filter((b) => b.block_type === "finisher"));

  it("attaches a finisher to strength sessions at all — nothing did before", () => {
    expect(blocks.length).toBeGreaterThan(4);
  });

  it("trains plyometrics fresh, on a strength day and never after a run", () => {
    const plyo = blocks.filter((b) => b.load_adjustments.variant_name === "Plyometrics");
    expect(plyo.length).toBeGreaterThan(1);
    const exercises = (plyo[0].content as { exercise: string }[]).map((c) => c.exercise).join(" ");
    expect(exercises.toLowerCase()).toContain("broad jump");
    expect(exercises.toLowerCase()).toContain("pogo");
  });

  it("trains grip in isolation, the way carries and sleds need it", () => {
    const grip = blocks.filter((b) => b.load_adjustments.variant_name === "Grip");
    expect(grip.length).toBeGreaterThan(1);
    const exercises = (grip[0].content as { exercise: string }[]).map((c) => c.exercise).join(" ");
    expect(exercises.toLowerCase()).toContain("dead hang");
  });

  it("alternates the two rather than favouring one", () => {
    const names = blocks.map((b) => b.load_adjustments.variant_name);
    expect(names.filter((n) => n === "Plyometrics").length).toBeGreaterThan(0);
    expect(names.filter((n) => n === "Grip").length).toBeGreaterThan(0);
  });
});

describe("polarisation after the restructure", () => {
  it("holds the prescription's window in every week except the simulation", () => {
    const { state, weeks } = plan();
    const off = weeks.filter(({ phase, w }) => {
      const summary = weeklyRunSummary(w.sessions, state.pace_zones, phase);
      const [min] = POLARISATION_BY_PHASE[phase];
      return summary.easy_share < min;
    });
    // Only the one full-simulation week may sit below its window.
    expect(off).toHaveLength(1);
    expect(off[0].w.sessions.some((s) => s.session_type === "full_sim")).toBe(true);
  });

  it("judges the share it shows, not one that differs in the third decimal", () => {
    const zones = defaultPaceZones(1350);
    const summary = weeklyRunSummary(
      [
        { session_type: "long_run", planned_duration_min: 70 },
        { session_type: "run_intervals", planned_duration_min: 55 },
        { session_type: "compromised_run", planned_duration_min: 55 },
        { session_type: "run_easy", planned_duration_min: 31 },
      ],
      zones,
      "build",
    );
    const [min, max] = POLARISATION_BY_PHASE.build;
    const inWindow = summary.easy_share >= min && summary.easy_share <= max;
    expect(inWindow ? "on_target" : summary.polarisation).toBe(summary.polarisation);
  });
});

describe("frequency advice by experience", () => {
  it("says when a beginner has picked an advanced load", () => {
    const advice = frequencyAdvice("beginner", 6);
    expect(advice.verdict).toBe("high");
    expect(advice.note).toContain("3-4");
  });

  it("treats AM/PM splits as the top level's tool, not as extra sessions", () => {
    // The prescription puts splits inside an advanced athlete's 5-6 days.
    expect(frequencyAdvice("advanced", 6, 1).verdict).toBe("ok");
    const early = frequencyAdvice("intermediate", 5, 1);
    expect(early.verdict).toBe("high");
    expect(early.note).toContain("AM/PM splits belong to the top level");
  });

  it("confirms a load that fits the level", () => {
    expect(frequencyAdvice("intermediate", 5, 0).verdict).toBe("ok");
    expect(frequencyAdvice("advanced", 6, 1).verdict).toBe("ok");
  });

  it("flags a load below the level, without refusing it", () => {
    const advice = frequencyAdvice("advanced", 3);
    expect(advice.verdict).toBe("low");
    expect(advice.note).toContain("aerobic volume");
  });

  it("names what the level should be focusing on", () => {
    expect(frequencyAdvice("advanced", 6).note).toContain("AM/PM");
    expect(frequencyAdvice("beginner", 3).note).toContain("station standards");
  });
});

describe("at least one full rest day", () => {
  it("never fills all seven days, at any frequency", () => {
    for (const days of [3, 4, 5, 6]) {
      for (const { w } of plan({ training_days_per_week: days, doubles_per_week: 3 }).weeks) {
        const used = new Set(w.sessions.map((s) => s.day_hint));
        expect(used.size, `week ${w.week_number} at ${days} days`).toBeLessThanOrEqual(6);
      }
    }
  });
});
