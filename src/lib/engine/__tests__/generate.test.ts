import { describe, it, expect } from "vitest";
import { splitPhases, buildPhasePlan } from "../macro";
import { generatePlan } from "../generate";
import { initialAthleteState } from "../index";
import type { AthleteProfile, ExperienceLevel, WorkoutBlock } from "../types";
import {
  compromisedLibraryBlocks,
  intervalLibraryBlocks,
  stationLibraryBlocks,
} from "../librarySeed";

// Minimal but representative library so fill() always finds something.
const library: WorkoutBlock[] = [
  { id: "wu", block_type: "warmup", station: "general", content: [], equipment_variant: "gym", difficulty_tier: 1, session_types: ["strength", "station_work", "run_intervals", "compromised_run", "full_sim", "benchmark"], tags: [] },
  { id: "wur", block_type: "warmup", station: "run", content: [], equipment_variant: "gym", difficulty_tier: 1, session_types: ["run_easy", "run_intervals", "compromised_run"], tags: [] },
  { id: "re", block_type: "main", station: "run", content: [], equipment_variant: "gym", difficulty_tier: 1, session_types: ["run_easy"], tags: [] },
  { id: "ri", block_type: "main", station: "run", content: [], equipment_variant: "gym", difficulty_tier: 2, session_types: ["run_intervals"], tags: [] },
  { id: "cr", block_type: "main", station: "general", content: [], equipment_variant: "gym", difficulty_tier: 2, session_types: ["compromised_run"], tags: [] },
  { id: "str", block_type: "main", station: "general", content: [], equipment_variant: "gym", difficulty_tier: 2, session_types: ["strength"], tags: [] },
  { id: "wb1", block_type: "main", station: "wall_balls", content: [], equipment_variant: "gym", difficulty_tier: 1, session_types: ["station_work"], tags: [] },
  { id: "wb3", block_type: "main", station: "wall_balls", content: [], equipment_variant: "gym", difficulty_tier: 3, session_types: ["station_work"], tags: [] },
  { id: "ski", block_type: "main", station: "ski_erg", content: [], equipment_variant: "gym", difficulty_tier: 2, session_types: ["station_work"], tags: [] },
  { id: "sim", block_type: "main", station: "general", content: [], equipment_variant: "gym", difficulty_tier: 2, session_types: ["full_sim"], tags: [] },
  { id: "mob", block_type: "mobility", station: "general", content: [], equipment_variant: "gym", difficulty_tier: 1, session_types: ["mobility", "strength", "station_work", "compromised_run"], tags: [] },
];

function profile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    id: "p1",
    division: "open",
    experience_level: "intermediate",
    five_k_seconds: 1350,
    station_estimates: {},
    training_days_per_week: 4,
    equipment_access: "full_gym",
    ...overrides,
  };
}

describe("macro phase split", () => {
  it("matches the tabulated 12-week split exactly (4 base / 4 build / 3 peak / 1 taper)", () => {
    expect(splitPhases(12).map((p) => p.weeks)).toEqual([4, 4, 3, 1]);
  });

  it("always preserves a taper (PP4) and sums to weeks for 8..16", () => {
    for (let w = 8; w <= 16; w++) {
      const split = splitPhases(w);
      const sum = split.reduce((a, p) => a + p.weeks, 0);
      expect(sum).toBe(w);
      expect(split.find((p) => p.phase_type === "taper")?.weeks).toBeGreaterThanOrEqual(1);
    }
  });

  it("handles crooked timelines (9, 11, 14 weeks) without breaking", () => {
    for (const w of [9, 11, 14]) {
      const split = splitPhases(w);
      expect(split.reduce((a, p) => a + p.weeks, 0)).toBe(w);
      expect(split.every((p) => p.weeks > 0)).toBe(true);
    }
  });

  it("gives contiguous, non-overlapping global week ranges", () => {
    const phases = buildPhasePlan(12);
    let expected = 1;
    for (const p of phases) {
      expect(p.start_week).toBe(expected);
      expect(p.end_week).toBeGreaterThanOrEqual(p.start_week);
      expected = p.end_week + 1;
    }
    expect(expected - 1).toBe(12);
  });
});

describe("plan generation (5 reference profiles: 8/10/12/16 wks x levels)", () => {
  const cases = [
    { weeks: 8, p: profile({ experience_level: "beginner", training_days_per_week: 3 }) },
    { weeks: 10, p: profile({ experience_level: "intermediate", training_days_per_week: 4 }) },
    { weeks: 12, p: profile({ experience_level: "advanced", training_days_per_week: 5 }) },
    { weeks: 16, p: profile({ experience_level: "intermediate", training_days_per_week: 6 }) },
    { weeks: 12, p: profile({ division: "pro", equipment_access: "home_minimal", training_days_per_week: 4 }) },
  ];

  for (const { weeks, p } of cases) {
    it(`generates a coherent ${weeks}-week plan for ${p.experience_level}/${p.training_days_per_week}d`, () => {
      const state = initialAthleteState(p);
      const plan = generatePlan({ profile: p, state, library, weeksToRace: weeks });

      const allWeeks = plan.phases.flatMap((ph) => ph.weeks);
      expect(allWeeks.length).toBe(weeks);

      // Week numbers are 1..weeks, contiguous & unique.
      expect(allWeeks.map((w) => w.week_number)).toEqual(
        Array.from({ length: weeks }, (_, i) => i + 1),
      );

      // Every week has a "why this week" explanation (PP1).
      expect(allWeeks.every((w) => w.weekly_goal.length > 20)).toBe(true);

      // Every non-rest session has at least a main block rendered.
      for (const w of allWeeks) {
        for (const s of w.sessions) {
          if (s.session_type === "rest") continue;
          expect(s.blocks.length).toBeGreaterThan(0);
        }
      }

      // Taper exists and is exactly the last block.
      expect(plan.phases[plan.phases.length - 1].phase_type).toBe("taper");

      // Week 1 is a benchmark week.
      expect(allWeeks[0].is_benchmark_week).toBe(true);
    });
  }

  it("is deterministic — same input, same plan", () => {
    const p = profile();
    const state = initialAthleteState(p);
    const a = JSON.stringify(generatePlan({ profile: p, state, library, weeksToRace: 12 }));
    const b = JSON.stringify(generatePlan({ profile: p, state, library, weeksToRace: 12 }));
    expect(a).toBe(b);
  });

  it("renders explicit division on every main block (PP2)", () => {
    const p = profile();
    const state = initialAthleteState(p);
    const plan = generatePlan({ profile: p, state, library, weeksToRace: 12 });
    const mains = plan.phases
      .flatMap((ph) => ph.weeks)
      .flatMap((w) => w.sessions)
      .flatMap((s) => s.blocks)
      .filter((b) => b.block_type === "main");
    expect(mains.length).toBeGreaterThan(0);
    expect(mains.every((b) => b.load_adjustments.division === "open")).toBe(true);
  });

  it("deloads every 3-4 weeks, never on a test week and never in the taper", () => {
    for (const weeksToRace of [12, 16]) {
      const p = profile();
      const state = initialAthleteState(p);
      const plan = generatePlan({ profile: p, state, library, weeksToRace });
      const weeks = plan.phases.flatMap((ph) =>
        ph.weeks.map((w) => ({ phase: ph.phase_type, ...w })),
      );
      const deloads = weeks.filter((w) => w.is_deload);
      expect(deloads.length, `${weeksToRace} weeks`).toBeGreaterThan(1);
      for (const w of deloads) {
        expect(w.phase, `deload in ${w.phase}`).not.toBe("taper");
        expect(w.is_benchmark_week).toBe(false);
        expect(w.sessions.some((s) => s.session_type === "full_sim")).toBe(false);
      }
      // No stretch of loading weeks longer than the rule allows, counting a
      // test week as the relief it is (it carries no doubles either).
      const relief = weeks
        .filter((w) => w.is_deload || w.is_benchmark_week)
        .map((w) => w.week_number);
      let previous = 0;
      for (const week of relief) {
        expect(week - previous, `${weeksToRace} weeks: gap before W${week}`).toBeLessThanOrEqual(4);
        previous = week;
      }
    }
  });
});

describe("a plan only ever names blocks that exist", () => {
  // session_blocks.block_id is a uuid with a foreign key into workout_blocks.
  // A block the engine invents but the library does not hold cannot be saved:
  // the whole plan fails on persist, and the athlete is told nothing useful.
  // The production library is the seed, compromised running included.
  const full: WorkoutBlock[] = [...library, ...compromisedLibraryBlocks(), ...stationLibraryBlocks(), ...intervalLibraryBlocks()];
  const known = new Set(full.map((b) => b.id));

  const levels: ExperienceLevel[] = ["beginner", "intermediate", "advanced", "elite", "world_class"];
  for (const level of levels) {
    it(`holds for a ${level} athlete across a full cycle`, () => {
      const p = profile({ experience_level: level, training_days_per_week: 6 });
      const state = initialAthleteState(p);
      const plan = generatePlan({ profile: p, state, library: full, weeksToRace: 16 });
      const blocks = plan.phases
        .flatMap((ph) => ph.weeks)
        .flatMap((w) => w.sessions)
        .flatMap((s) => s.blocks);
      // Proof the levelled catalogues are actually on this path — they are
      // the ones that named a slug where a uuid belonged.
      for (const catalogue of [
        compromisedLibraryBlocks(),
        stationLibraryBlocks(),
        intervalLibraryBlocks(),
      ]) {
        const ids = new Set(catalogue.map((b) => b.id));
        expect(blocks.some((b) => ids.has(b.block_id))).toBe(true);
      }
      const unknown = blocks.filter((b) => !known.has(b.block_id)).map((b) => b.block_id);
      expect(unknown).toEqual([]);
    });
  }
});
