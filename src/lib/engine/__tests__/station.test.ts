// Isolated station work: what the catalogue promises, and what a plan does
// with it. The claim being tested is the one that justifies the session type
// existing — station load without running load — plus the level specificity,
// which is the whole reason there are sixty of them and not eleven.
import { describe, it, expect } from "vitest";
import {
  STATION_SESSIONS,
  pickStationSession,
  generatePlan,
  initialAthleteState,
  type AthleteProfile,
  type ExperienceLevel,
  type PhaseType,
} from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";

const LEVELS: ExperienceLevel[] = ["beginner", "intermediate", "advanced", "elite", "world_class"];
const PHASES: PhaseType[] = ["base", "build", "peak", "taper"];

const query = (level: ExperienceLevel, phase: PhaseType, week: number, over = {}) => ({
  level,
  phase,
  weekNumber: week,
  equipment: "full_gym" as const,
  stationTiers: {},
  ...over,
});

describe("the station catalogue", () => {
  it("covers every level in every phase, three deep", () => {
    for (const level of LEVELS) {
      for (const phase of PHASES) {
        const found = STATION_SESSIONS.filter((s) => s.level === level && s.phase === phase);
        expect(found, `${level}/${phase}`).toHaveLength(3);
      }
    }
  });

  it("gives every session a name and a reason a coach would give", () => {
    for (const s of STATION_SESSIONS) {
      expect(s.name.length, s.slug).toBeGreaterThan(4);
      expect(s.why.length, s.slug).toBeGreaterThan(30);
      expect(s.lines.length, s.slug).toBeGreaterThan(0);
      expect(s.rounds, s.slug).toBeGreaterThan(0);
    }
  });

  it("never contains a running line — that is the point of it", () => {
    // Station work is prescribed precisely because it loads the stations
    // without adding mileage. A run in here would silently blow the week's
    // running budget, which is measured from the plan, not from the label.
    for (const s of STATION_SESSIONS) {
      expect(s.lines.some((l) => l.is_run), s.slug).toBe(false);
    }
  });

  it("states both division loads wherever it names a weight (PP2)", () => {
    for (const s of STATION_SESSIONS) {
      for (const line of s.lines) {
        if (!line.load_by_division) continue;
        expect(line.load_by_division.open, `${s.slug}: ${line.exercise}`).toMatch(/kg/);
        expect(line.load_by_division.pro, `${s.slug}: ${line.exercise}`).toMatch(/kg/);
      }
    }
  });

  it("keeps a beginner under race weight in base, and a world-class athlete over it", () => {
    // The levels are not the same session at a different weight, and the base
    // block is where that shows most plainly: one is learning the movement,
    // the other is overloading past what the race will ask.
    const heaviest = (level: ExperienceLevel) =>
      Math.max(
        ...STATION_SESSIONS.filter((s) => s.level === level && s.phase === "base").flatMap((s) =>
          s.lines.flatMap((l) =>
            Object.values(l.load_by_division ?? {}).map((v) =>
              Math.max(...(v.match(/\d+/g) ?? ["0"]).map(Number)),
            ),
          ),
        ),
        0,
      );
    // 152 kg is the open sled push at race weight; 202 kg the pro one.
    expect(heaviest("beginner")).toBeLessThan(152);
    expect(heaviest("world_class")).toBeGreaterThanOrEqual(202);
  });

  it("never gives the same session to two levels", () => {
    const byLevel = new Map<string, ExperienceLevel>();
    for (const s of STATION_SESSIONS) {
      expect(byLevel.has(s.slug)).toBe(false);
      byLevel.set(s.slug, s.level);
    }
  });
});

describe("picking a station session", () => {
  it("always finds one, for every level, phase and week", () => {
    for (const level of LEVELS) {
      for (const phase of PHASES) {
        for (let w = 1; w <= 16; w++) {
          const pick = pickStationSession(query(level, phase, w))!;
          expect(pick, `${level}/${phase}/w${w}`).toBeTruthy();
          expect(pick.session.level).toBe(level);
          expect(pick.session.phase).toBe(phase);
        }
      }
    }
  });

  it("rotates rather than repeating the same session every week", () => {
    const slugs = Array.from(
      { length: 6 },
      (_, i) => pickStationSession(query("advanced", "build", i + 1))!.session.slug,
    );
    expect(new Set(slugs).size).toBeGreaterThan(1);
  });

  it("goes after the weakest station on alternating weeks, not every week", () => {
    const tiers = { wall_balls: 1, ski_erg: 3, row: 3, sled_push: 3 };
    const picks = Array.from(
      { length: 6 },
      (_, i) => pickStationSession(query("advanced", "build", i + 1, { stationTiers: tiers }))!,
    );
    expect(picks.filter((p) => p.targeted).length).toBeGreaterThan(0);
    expect(picks.filter((p) => !p.targeted).length).toBeGreaterThan(0);
    for (const p of picks.filter((x) => x.targeted)) expect(p.session.station).toBe("wall_balls");
  });

  it("never hands an erg session to an athlete without an erg", () => {
    for (const level of LEVELS) {
      for (const phase of PHASES) {
        for (let w = 1; w <= 8; w++) {
          const pick = pickStationSession(query(level, phase, w, { equipment: "home_minimal" }));
          expect(pick, `${level}/${phase}`).toBeTruthy();
          expect(pick!.session.needs_erg ?? false, pick!.session.slug).toBe(false);
        }
      }
    }
  });
});

describe("station work in a generated plan", () => {
  const profile: AthleteProfile = {
    id: "p",
    division: "pro",
    experience_level: "elite",
    five_k_seconds: 1080,
    station_estimates: {},
    training_days_per_week: 6,
    equipment_access: "full_gym",
  };
  const state = initialAthleteState(profile);
  const plan = generatePlan({ profile, state, library: DEMO_LIBRARY, weeksToRace: 16 });
  const stationBlocks = plan.phases
    .flatMap((ph) => ph.weeks)
    .flatMap((w) => w.sessions.filter((s) => s.session_type === "station_work"))
    .flatMap((s) => s.blocks.filter((b) => b.block_type === "main"));

  it("prescribes the athlete's own level, not a generic station session", () => {
    expect(stationBlocks.length).toBeGreaterThan(3);
    const slugs = new Set(stationBlocks.map((b) => b.slug));
    const elite = new Set(
      STATION_SESSIONS.filter((s) => s.level === "elite").map((s) => s.slug),
    );
    for (const slug of slugs) expect(elite.has(slug!), slug).toBe(true);
  });

  it("carries the session's name and reason onto the card", () => {
    for (const b of stationBlocks) {
      expect(b.load_adjustments.variant_name?.length ?? 0).toBeGreaterThan(4);
      expect(b.load_adjustments.variant_why?.length ?? 0).toBeGreaterThan(30);
    }
  });
});
