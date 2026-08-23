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
  TRAINING_MIX,
  weeklyRunSummary,
  type AthleteProfile,
  type ExperienceLevel,
  type SessionType,
  type TrainingMix,
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

describe("the 16-week cycle earns the long taper", () => {
  it("splits 5 base / 5 build / 4 peak / 2 taper", () => {
    // The reference gives peak 3-4 weeks and the taper 1-2; a 16-week runway
    // is what affords both their long form.
    expect(splitPhases(16).map((p) => p.weeks)).toEqual([5, 5, 4, 2]);
  });
});

describe("spacing across the week (the recovery physiology)", () => {
  const HARD: SessionType[] = ["run_intervals", "compromised_run", "full_sim", "benchmark", "race_day"];

  /** AM sessions of one week, keyed by calendar day. */
  function daysOf(w: { sessions: { day_hint: number; day_slot: string; session_type: SessionType }[] }) {
    return w.sessions
      .filter((s) => s.day_slot !== "pm")
      .map((s) => ({ day: s.day_hint, type: s.session_type }))
      .sort((a, b) => a.day - b.day);
  }

  it("never puts two hard endurance days back to back", () => {
    // Between two hard days there is always a Zone-2 day, a load day, or a
    // gap — the reference's "Dienstag Intervalle, Samstag Simulation" shape.
    for (const days of [3, 4, 5, 6]) {
      for (const { w } of plan({ training_days_per_week: days }, 12).weeks) {
        const seq = daysOf(w);
        for (let i = 1; i < seq.length; i++) {
          const adjacentHard =
            seq[i].day - seq[i - 1].day === 1 &&
            HARD.includes(seq[i].type) &&
            HARD.includes(seq[i - 1].type);
          expect(adjacentHard, `${days}d week ${JSON.stringify(seq)}`).toBe(false);
        }
      }
    }
  });

  it("never schedules strength on the day right after a hard day", () => {
    // The strength session opens with plyometrics, and for 24-48h after a
    // hard day the CNS is not fresh enough for explosive work.
    for (const days of [4, 5, 6]) {
      for (const { w } of plan({ training_days_per_week: days }, 12).weeks) {
        const seq = daysOf(w);
        for (let i = 1; i < seq.length; i++) {
          const strengthAfterHard =
            seq[i].day - seq[i - 1].day === 1 &&
            seq[i].type === "strength" &&
            HARD.includes(seq[i - 1].type);
          expect(strengthAfterHard, `${days}d week ${JSON.stringify(seq)}`).toBe(false);
        }
      }
    }
  });

  it("orders a double day strength-first: the AM is the key session, the PM is easy", () => {
    // Minimum separation on a double day is the AM/PM split itself, and the
    // neurally demanding session comes first — strength before endurance.
    const { weeks } = plan({ training_days_per_week: 5, doubles_per_week: 2 }, 12);
    for (const { w } of weeks) {
      for (const s of w.sessions) {
        if (s.day_slot !== "pm") continue;
        expect(["run_easy", "mobility"]).toContain(s.session_type);
        const host = w.sessions.find((h) => h.day_hint === s.day_hint && h.day_slot !== "pm")!;
        expect(HARD.includes(host.session_type) && s.session_type === "run_easy").toBe(false);
      }
    }
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
  // The reference table: level -> days, sessions and target time.
  //   beginner 3-4d/3-4s · intermediate 4-5d/4-5s · advanced 5d/5-6s
  //   elite 5-6d/6-8s (doubles sometimes) · world class 6d/7-9s (doubles the norm)

  it("says when a beginner has picked an advanced load", () => {
    const advice = frequencyAdvice("beginner", 6);
    expect(advice.verdict).toBe("high");
    expect(advice.note).toContain("3–4");
  });

  it("lets doubles in from advanced upward, and not before", () => {
    // An advanced athlete's 5 days plus one double = 6 sessions, in range.
    expect(frequencyAdvice("advanced", 5, 1).verdict).toBe("ok");
    const early = frequencyAdvice("intermediate", 5, 1);
    expect(early.verdict).toBe("high");
    expect(early.note).toContain("AM/PM splits enter the picture from the advanced level");
  });

  it("judges sessions, not just days — six days without doubles overloads advanced", () => {
    // The reference caps advanced at 5 days; the sixth day is elite territory.
    expect(frequencyAdvice("advanced", 6, 0).verdict).toBe("high");
    expect(frequencyAdvice("elite", 6, 2).verdict).toBe("ok"); // 8 sessions
    expect(frequencyAdvice("elite", 6, 3).verdict).toBe("high"); // 9 sessions
  });

  it("expects doubles at world class — six days alone is under its floor", () => {
    // 7-9 sessions on 6 days requires at least one AM/PM split.
    expect(frequencyAdvice("world_class", 6, 0).verdict).toBe("low");
    const wc = frequencyAdvice("world_class", 6, 2);
    expect(wc.verdict).toBe("ok");
    expect(frequencyAdvice("world_class", 6, 1).note).toContain("sub 60");
  });

  it("confirms a load that fits the level, and names the target time", () => {
    expect(frequencyAdvice("intermediate", 5, 0).verdict).toBe("ok");
    expect(frequencyAdvice("intermediate", 5, 0).note).toContain("sub 1:30");
    expect(frequencyAdvice("elite", 5, 1).verdict).toBe("ok");
  });

  it("flags a load below the level, without refusing it", () => {
    const advice = frequencyAdvice("advanced", 3);
    expect(advice.verdict).toBe("low");
    expect(advice.note).toContain("aerobic volume");
  });

  it("names what the level should be focusing on", () => {
    expect(frequencyAdvice("beginner", 3).note).toContain("station standards");
    expect(frequencyAdvice("elite", 6, 1).note).toContain("plyometrics");
    expect(frequencyAdvice("world_class", 6, 1).note).toContain("transitions");
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

describe("the frequency note reads as a sentence", () => {
  it("gets the article right for every level", () => {
    // The level names are data; "a advanced athlete" is what happens when the
    // article is written into the sentence instead of derived from them.
    for (const [level, expected] of [
      ["beginner", "a beginner"],
      ["intermediate", "an intermediate"],
      ["advanced", "an advanced"],
      ["elite", "an elite"],
      ["world_class", "a world-class"],
    ] as const) {
      const note = frequencyAdvice(level, 9, 0).note; // 9 days: always "high"
      expect(note, level).toContain(expected);
    }
  });
});

describe("the training mix", () => {
  // The prescription is a share of planned minutes per level and phase
  // (TRAINING_MIX). This is the test that says the plan actually follows it,
  // rather than the priority list's first N entries — which is level-blind and
  // was how a beginner got no station work in base and no strength in peak.
  const SETUP: Record<ExperienceLevel, [days: number, doubles: number]> = {
    beginner: [4, 0],
    intermediate: [5, 0],
    advanced: [5, 1],
    elite: [6, 2],
    world_class: [6, 3],
  };

  const CATEGORY: Record<string, keyof TrainingMix> = {
    long_run: "run",
    run_easy: "run",
    run_intervals: "run",
    strength: "strength",
    station_work: "station",
    compromised_run: "compromised",
    full_sim: "compromised",
  };

  function sharesFor(level: ExperienceLevel) {
    const [days, doubles] = SETUP[level];
    const p = profile({ experience_level: level, training_days_per_week: days, doubles_per_week: doubles });
    const state = initialAthleteState(p);
    const generated = generatePlan({ profile: p, state, library: DEMO_LIBRARY, weeksToRace: 12 });
    return generated.phases.map((ph) => {
      const minutes: Record<string, number> = {};
      let total = 0;
      for (const w of ph.weeks) {
        for (const s of w.sessions) {
          const category = CATEGORY[s.session_type];
          if (!category) continue;
          minutes[category] = (minutes[category] ?? 0) + s.planned_duration_min;
          total += s.planned_duration_min;
        }
      }
      return { phase: ph.phase_type, minutes, total };
    });
  }

  for (const level of Object.keys(SETUP) as ExperienceLevel[]) {
    it(`follows the ${level} prescription through base, build and peak`, () => {
      for (const { phase, minutes, total } of sharesFor(level)) {
        // The taper is left out on purpose: one week of four to six sessions
        // cannot hold four categories to the point, and a benchmark test takes
        // one of those slots. What it must do is tested below.
        if (phase === "taper") continue;
        const want = TRAINING_MIX[level][phase];
        for (const category of Object.keys(want) as (keyof TrainingMix)[]) {
          const got = (minutes[category] ?? 0) / total;
          expect(
            Math.abs(got - want[category]),
            `${level}/${phase}/${category}: ${Math.round(got * 100)}% against ${Math.round(want[category] * 100)}%`,
          ).toBeLessThanOrEqual(0.12);
        }
      }
    });
  }

  it("ramps compromised running and sheds strength as the race comes closer", () => {
    for (const level of Object.keys(SETUP) as ExperienceLevel[]) {
      const rows = sharesFor(level);
      const share = (phase: string, category: keyof TrainingMix) => {
        const row = rows.find((r) => r.phase === phase)!;
        return (row.minutes[category] ?? 0) / row.total;
      };
      expect(share("peak", "compromised"), level).toBeGreaterThan(share("base", "compromised"));
      expect(share("peak", "strength"), level).toBeLessThan(share("base", "strength"));
    }
  });

  it("gives every level a taste of compromised running in the base block", () => {
    // The base block owns running economy and maximal strength, so this is a
    // taste and not a staple — but a block that never rehearses running out of
    // a station at all leaves the whole adaptation to the build.
    for (const level of Object.keys(SETUP) as ExperienceLevel[]) {
      const base = sharesFor(level).find((r) => r.phase === "base")!;
      expect(base.minutes.compromised ?? 0, `${level} has none`).toBeGreaterThan(0);
      expect((base.minutes.compromised ?? 0) / base.total, `${level} overdoes it`).toBeLessThan(0.2);
    }
  });

  it("cuts the taper by 40-60% of the peak week, intensity kept", () => {
    for (const level of Object.keys(SETUP) as ExperienceLevel[]) {
      const rows = sharesFor(level);
      const perWeek = (phase: string) => {
        const p = profile({ experience_level: level });
        void p;
        const row = rows.find((r) => r.phase === phase)!;
        return row.total;
      };
      const peak = perWeek("peak") / 3;
      const taper = perWeek("taper");
      const cut = 1 - taper / peak;
      expect(cut, `${level}: taper is ${Math.round(cut * 100)}% down`).toBeGreaterThan(0.4);
      expect(cut, `${level}: taper is ${Math.round(cut * 100)}% down`).toBeLessThan(0.65);
    }
  });
});

describe("ergometer offloading", () => {
  // 20-40% of easy endurance volume belongs on a SkiErg, rower or bike at high
  // training loads: the aerobic work is the same and the Achilles pays none of
  // it. The PM session of a double day is where it goes — it is the week's
  // extra volume, and the only easy run whose slot the athlete did not pick.
  it("puts the second session of a double day on the erg, not on the road", () => {
    const { weeks } = plan({ training_days_per_week: 5, doubles_per_week: 2 }, 12);
    const pmRuns = weeks
      .flatMap(({ w }) => w.sessions)
      .filter((s) => s.day_slot === "pm" && s.session_type === "run_easy");
    expect(pmRuns.length).toBeGreaterThan(3);
    for (const s of pmRuns) {
      const main = s.blocks.find((b) => b.block_type === "main");
      expect(main?.load_adjustments.variant_name, JSON.stringify(main?.slug)).toBe(
        "Cross-Training Combo",
      );
    }
  });

  it("moves the easy volume and nothing else", () => {
    // The offload buys back impact on the recovery kilometres. The long run,
    // the quality session and the station work are the training — none of them
    // is allowed to become an erg session by this route.
    const { weeks } = plan({ training_days_per_week: 5, doubles_per_week: 2 }, 12);
    const misplaced = weeks
      .flatMap(({ w }) => w.sessions)
      .filter((s) => s.session_type !== "run_easy")
      .flatMap((s) => s.blocks)
      .filter((b) => b.load_adjustments.variant_name === "Cross-Training Combo");
    expect(misplaced).toHaveLength(0);
  });

  it("does not prescribe an erg to someone who has none", () => {
    const { weeks } = plan(
      { training_days_per_week: 5, doubles_per_week: 2, equipment_access: "home_minimal" },
      12,
    );
    const pm = weeks
      .flatMap(({ w }) => w.sessions)
      .filter((s) => s.day_slot === "pm")
      .flatMap((s) => s.blocks);
    expect(pm.every((b) => b.load_adjustments.variant_name !== "Cross-Training Combo")).toBe(true);
  });
});
