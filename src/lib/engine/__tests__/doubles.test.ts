import { describe, it, expect } from "vitest";
import { distributeSlots, doublesForWeek } from "../micro";
import { generatePlan, initialAthleteState, type AthleteProfile, type PhaseType } from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";
import { slotForRun } from "@/lib/autoLogRun";

const PHASES: PhaseType[] = ["base", "build", "peak", "taper"];
/** Sessions that must never share a day with another hard session. */
const HARD = ["compromised_run", "run_intervals", "full_sim", "benchmark"];

function week(opts: Partial<Parameters<typeof distributeSlots>[0]> = {}) {
  return distributeSlots({
    phase: "build",
    trainingDays: 5,
    weekInPhase: 1,
    isDeload: false,
    isBenchmark: false,
    doublesPerWeek: 2,
    ...opts,
  });
}

describe("double days — the invariants", () => {
  it("adds exactly one PM session per requested double", () => {
    for (let doubles = 0; doubles <= 3; doubles++) {
      const slots = week({ doublesPerWeek: doubles });
      expect(slots.filter((s) => s.day_slot === "pm")).toHaveLength(doubles);
      expect(slots).toHaveLength(5 + doubles);
    }
  });

  it("never puts more than two sessions on a day, and never two in the same half", () => {
    for (const phase of PHASES) {
      for (let days = 3; days <= 6; days++) {
        for (let doubles = 0; doubles <= 3; doubles++) {
          for (const isDeload of [false, true]) {
            for (const isBenchmark of [false, true]) {
              const slots = distributeSlots({
                phase,
                trainingDays: days,
                weekInPhase: 1,
                isDeload,
                isBenchmark,
                doublesPerWeek: doubles,
              });
              const keys = slots.map((s) => `${s.day_hint}-${s.day_slot}`);
              expect(new Set(keys).size, `${phase}/${days}d/${doubles}x`).toBe(keys.length);
              const perDay = new Map<number, number>();
              for (const s of slots) perDay.set(s.day_hint, (perDay.get(s.day_hint) ?? 0) + 1);
              for (const n of perDay.values()) expect(n).toBeLessThanOrEqual(2);
            }
          }
        }
      }
    }
  });

  it("never stacks two hard sessions on one day", () => {
    for (const phase of PHASES) {
      for (let days = 3; days <= 6; days++) {
        const slots = distributeSlots({
          phase,
          trainingDays: days,
          weekInPhase: 1,
          isDeload: false,
          isBenchmark: false,
          doublesPerWeek: 3,
        });
        const hardPerDay = new Map<number, number>();
        for (const s of slots.filter((x) => HARD.includes(x.session_type))) {
          hardPerDay.set(s.day_hint, (hardPerDay.get(s.day_hint) ?? 0) + 1);
        }
        for (const n of hardPerDay.values()) expect(n).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps the PM session lighter and shorter than the morning it follows", () => {
    const slots = week({ doublesPerWeek: 3 });
    for (const pm of slots.filter((s) => s.day_slot === "pm")) {
      const am = slots.find((s) => s.day_hint === pm.day_hint && s.day_slot === "am")!;
      expect(pm.intensity_rpe_target).toBeLessThan(am.intensity_rpe_target);
      expect(pm.planned_duration_min).toBeLessThan(am.planned_duration_min);
    }
  });

  it("complements the morning instead of repeating it", () => {
    const slots = week({ doublesPerWeek: 3 });
    const pairs = slots
      .filter((s) => s.day_slot === "pm")
      .map((pm) => [
        slots.find((s) => s.day_hint === pm.day_hint && s.day_slot === "am")!.session_type,
        pm.session_type,
      ]);
    expect(pairs.length).toBeGreaterThan(0);
    for (const [am, pm] of pairs) {
      expect(am).not.toBe(pm);
      // Strength / stations are followed by easy aerobic work, runs by mobility.
      expect(pm).toBe(am === "strength" || am === "station_work" ? "run_easy" : "mobility");
    }
  });

  it("puts the doubles on the hard mornings first", () => {
    const slots = week({ doublesPerWeek: 1 });
    const pm = slots.find((s) => s.day_slot === "pm")!;
    const host = slots.find((s) => s.day_hint === pm.day_hint && s.day_slot === "am")!;
    expect(HARD).toContain(host.session_type);
  });

  it("orders the week chronologically, AM before PM", () => {
    const slots = week({ doublesPerWeek: 3 });
    slots.forEach((s, i) => expect(s.sort_order).toBe(i));
    for (let i = 1; i < slots.length; i++) {
      const prev = slots[i - 1];
      const cur = slots[i];
      expect(cur.day_hint).toBeGreaterThanOrEqual(prev.day_hint);
      if (cur.day_hint === prev.day_hint) {
        expect(prev.day_slot).toBe("am");
        expect(cur.day_slot).toBe("pm");
      }
    }
  });
});

describe("doublesForWeek — when a second session is wrong", () => {
  it("drops doubles in a taper, a deload and a benchmark week", () => {
    const base = { trainingDays: 5, doublesPerWeek: 3, isDeload: false, isBenchmark: false };
    expect(doublesForWeek({ ...base, phase: "build" })).toBe(3);
    expect(doublesForWeek({ ...base, phase: "taper" })).toBe(0);
    expect(doublesForWeek({ ...base, phase: "build", isDeload: true })).toBe(0);
    expect(doublesForWeek({ ...base, phase: "build", isBenchmark: true })).toBe(0);
  });

  it("always leaves at least one single training day", () => {
    for (let days = 3; days <= 6; days++) {
      const n = doublesForWeek({
        phase: "build",
        trainingDays: days,
        doublesPerWeek: 3,
        isDeload: false,
        isBenchmark: false,
      });
      expect(n).toBeLessThanOrEqual(days - 1);
    }
  });

  it("is off unless the athlete asked for it", () => {
    expect(
      doublesForWeek({ phase: "build", trainingDays: 5, doublesPerWeek: 0, isDeload: false, isBenchmark: false }),
    ).toBe(0);
  });
});

describe("a generated plan with doubles", () => {
  const profile: AthleteProfile = {
    id: "t",
    division: "open",
    experience_level: "intermediate",
    five_k_seconds: 1350,
    station_estimates: {},
    training_days_per_week: 5,
    doubles_per_week: 2,
    equipment_access: "full_gym",
  };
  const plan = generatePlan({
    profile,
    state: initialAthleteState(profile),
    library: DEMO_LIBRARY,
    weeksToRace: 12,
  });
  const weeks = plan.phases.flatMap((p) => p.weeks);

  it("carries the slot all the way into the generated sessions", () => {
    const all = weeks.flatMap((w) => w.sessions);
    expect(all.every((s) => s.day_slot === "am" || s.day_slot === "pm")).toBe(true);
    expect(all.some((s) => s.day_slot === "pm")).toBe(true);
  });

  it("counts the PM sessions in target_sessions, and blocks them like any other", () => {
    for (const w of weeks) {
      expect(w.target_sessions).toBe(w.sessions.length);
      for (const s of w.sessions) expect(s.blocks.length).toBeGreaterThan(0);
    }
  });

  it("leaves taper, deload and benchmark weeks single-session", () => {
    const taperWeeks = plan.phases.filter((p) => p.phase_type === "taper").flatMap((p) => p.weeks);
    for (const w of [...taperWeeks, ...weeks.filter((x) => x.is_deload || x.is_benchmark_week)]) {
      expect(w.sessions.filter((s) => s.day_slot === "pm")).toHaveLength(0);
    }
  });

  it("stays deterministic", () => {
    const again = generatePlan({
      profile,
      state: initialAthleteState(profile),
      library: DEMO_LIBRARY,
      weeksToRace: 12,
    });
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
  });
});

describe("slotForRun", () => {
  it("maps a run's start time onto the half of the day it belongs to", () => {
    expect(slotForRun("2026-08-21T06:30:00.000Z")).toBe("am");
    expect(slotForRun("2026-08-21T18:05:00.000Z")).toBe("pm");
    expect(slotForRun(undefined)).toBeNull();
    expect(slotForRun("not a date")).toBeNull();
  });
});
