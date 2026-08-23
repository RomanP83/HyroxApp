import { describe, it, expect } from "vitest";
import {
  COMPROMISED_SESSIONS,
  pickCompromisedSession,
  runningMetres,
  generatePlan,
  initialAthleteState,
  type AthleteProfile,
  type ExperienceLevel,
  type PhaseType,
} from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";

const LEVELS: ExperienceLevel[] = [
  "beginner",
  "intermediate",
  "advanced",
  "elite",
  "world_class",
];
const PHASES: PhaseType[] = ["base", "build", "peak", "taper"];

const query = (level: ExperienceLevel, phase: PhaseType, week: number, over = {}) => ({
  level,
  phase,
  weekNumber: week,
  equipment: "full_gym" as const,
  stationTiers: {},
  ...over,
});

describe("the compromised catalogue", () => {
  it("covers every level in every phase, three deep", () => {
    for (const level of LEVELS) {
      for (const phase of PHASES) {
        const found = COMPROMISED_SESSIONS.filter((s) => s.level === level && s.phase === phase);
        expect(found, `${level}/${phase}`).toHaveLength(3);
      }
    }
  });

  it("gives every session a unique slug, a name and a reason a coach would give", () => {
    const slugs = COMPROMISED_SESSIONS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of COMPROMISED_SESSIONS) {
      expect(s.name.length, s.slug).toBeGreaterThan(4);
      expect(s.why.length, s.slug).toBeGreaterThan(30);
      expect(s.lines.length, s.slug).toBeGreaterThan(1);
    }
  });

  it("counts rounds, so a session's running volume is knowable", () => {
    // The round count is data, not prose: three rounds of two kilometres is
    // six, and nothing could work that out from a sentence.
    const sandwich = COMPROMISED_SESSIONS.find((s) => s.slug === "cr_i3_sled_sandwich")!;
    expect(sandwich.rounds).toBe(3);
    expect(runningMetres(sandwich)).toBe(6000);
  });

  it("asks a beginner for far less running than anyone above them", () => {
    // Deliberately not a monotonic rule across all five: the world-class block
    // trains velocity and split precision rather than volume, so it runs fewer
    // metres than elite by design. The floor is what matters.
    const metres = (level: ExperienceLevel) =>
      COMPROMISED_SESSIONS.filter((s) => s.level === level).reduce(
        (n, s) => n + runningMetres(s),
        0,
      );
    const beginner = metres("beginner");
    expect(metres("intermediate")).toBeLessThan(metres("advanced"));
    for (const level of LEVELS.slice(1)) {
      expect(metres(level), level).toBeGreaterThan(beginner * 1.3);
    }
  });
});

describe("picking one", () => {
  it("stays inside the athlete's level and phase", () => {
    for (const level of LEVELS) {
      for (const phase of PHASES) {
        for (let w = 1; w <= 6; w++) {
          const pick = pickCompromisedSession(query(level, phase, w))!;
          expect(pick.session.level, `${level}/${phase}/w${w}`).toBe(level);
          expect(pick.session.phase).toBe(phase);
        }
      }
    }
  });

  it("rotates rather than repeating", () => {
    const slugs = Array.from(
      { length: 6 },
      (_, i) => pickCompromisedSession(query("advanced", "build", i + 1))!.session.slug,
    );
    expect(new Set(slugs).size).toBeGreaterThan(1);
  });

  it("aims every second week at the weakest station", () => {
    const tiers = { sled_push: 1, row: 3, wall_balls: 3 };
    const picks = Array.from({ length: 6 }, (_, i) =>
      pickCompromisedSession(query("advanced", "build", i + 1, { stationTiers: tiers }))!,
    );
    const targeted = picks.filter((p) => p.targeted);
    expect(targeted.length).toBeGreaterThan(0);
    expect(targeted.every((p) => p.session.station === "sled_push")).toBe(true);
    // The weeks between deliberately avoid it, or the focus is just repetition.
    expect(picks.filter((p) => !p.targeted).every((p) => p.session.station !== "sled_push")).toBe(
      true,
    );
  });

  it("never prescribes an erg session to an athlete without one", () => {
    for (const level of LEVELS) {
      for (const phase of PHASES) {
        for (let w = 1; w <= 6; w++) {
          const pick = pickCompromisedSession(
            query(level, phase, w, { equipment: "home_minimal" }),
          );
          expect(pick?.session.needs_erg, `${level}/${phase}/w${w}`).toBeFalsy();
        }
      }
    }
  });

  it("still finds a session when the level has nothing left without an erg", () => {
    // Every level/phase must yield something for a home-gym athlete, even if
    // it has to come from a neighbouring level.
    for (const level of LEVELS) {
      for (const phase of PHASES) {
        expect(
          pickCompromisedSession(query(level, phase, 1, { equipment: "home_minimal" })),
          `${level}/${phase}`,
        ).not.toBeNull();
      }
    }
  });
});

describe("in a generated plan", () => {
  const profile = (level: ExperienceLevel) =>
    ({
      id: "p",
      division: "open",
      experience_level: level,
      five_k_seconds: 1300,
      station_estimates: {},
      training_days_per_week: 5,
      equipment_access: "full_gym",
    }) as unknown as AthleteProfile;

  it("renders the level's own session, with its opening buffer", () => {
    for (const level of LEVELS) {
      const p = profile(level);
      const plan = generatePlan({
        profile: p,
        state: initialAthleteState(p),
        library: DEMO_LIBRARY,
        weeksToRace: 12,
      });
      const sessions = plan.phases
        .flatMap((ph) => ph.weeks)
        .flatMap((w) => w.sessions)
        .filter((s) => s.session_type === "compromised_run");
      expect(sessions.length, level).toBeGreaterThan(0);

      const main = sessions[0].blocks.find((b) => b.block_type === "main")!;
      expect(main.slug, level).toMatch(/^cr_/);
      // The level shows in the slug, so a plan cannot quietly serve another
      // level's prescription.
      const prefix = { beginner: "b", intermediate: "i", advanced: "a", elite: "e", world_class: "w" }[
        level
      ];
      expect(main.slug!.startsWith(`cr_${prefix}`), `${level} got ${main.slug}`).toBe(true);
      expect(main.load_adjustments.opening_pace_sec_km).toBeGreaterThan(0);
      expect(main.load_adjustments.variant_name!.length).toBeGreaterThan(4);
    }
  });
});
