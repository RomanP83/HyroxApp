// Threshold and VO2max intervals. The claim being tested is the one that
// justifies keeping this session type unloaded: pure running, no station, no
// equipment — so the pace is the only variable and the target is clean.
import { describe, it, expect } from "vitest";
import {
  INTERVAL_SESSIONS,
  pickIntervalSession,
  runningMetres,
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

describe("the interval catalogue", () => {
  it("covers every level in every phase, at least four deep", () => {
    for (const level of LEVELS) {
      for (const phase of PHASES) {
        const found = INTERVAL_SESSIONS.filter((s) => s.level === level && s.phase === phase);
        expect(found.length, `${level}/${phase}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("gives every session a name and a reason a coach would give", () => {
    for (const s of INTERVAL_SESSIONS) {
      expect(s.name.length, s.slug).toBeGreaterThan(4);
      expect(s.why.length, s.slug).toBeGreaterThan(30);
      expect(s.lines.length, s.slug).toBeGreaterThan(0);
    }
  });

  it("is running and nothing but running", () => {
    // The point of the session type: no sled, no erg, no wall ball before the
    // reps. A station in here would cap the speed and blur the target, which
    // is exactly what compromised running is for instead.
    for (const s of INTERVAL_SESSIONS) {
      expect(s.lines.every((l) => l.is_run), s.slug).toBe(true);
      expect(s.station, s.slug).toBeUndefined();
      expect(s.needs_erg ?? false, s.slug).toBe(false);
      for (const l of s.lines) expect(l.load_by_division, `${s.slug}: ${l.exercise}`).toBeUndefined();
    }
  });

  it("asks for more running at every step up the levels", () => {
    const kmInPeak = (level: ExperienceLevel) =>
      INTERVAL_SESSIONS.filter((s) => s.level === level && s.phase === "peak").reduce(
        (n, s) => n + runningMetres(s),
        0,
      );
    const volumes = LEVELS.map(kmInPeak);
    for (let i = 1; i < volumes.length; i++) {
      expect(volumes[i], `${LEVELS[i]} vs ${LEVELS[i - 1]}`).toBeGreaterThan(volumes[i - 1]);
    }
  });

  it("counts a repeated rep as the volume it is", () => {
    // 8 × 1000 m is eight kilometres, and nothing could work that out from the
    // sentence alone — which is why sets is data on the line.
    const eight = INTERVAL_SESSIONS.find((s) => s.slug === "ri_e3_eight_at_race_pace")!;
    expect(runningMetres(eight)).toBe(8000);
    const shuttle = INTERVAL_SESSIONS.find((s) => s.slug === "ri_a2_lactate_shuttle")!;
    expect(runningMetres(shuttle)).toBe(4 * 1600);
  });
});

describe("picking an interval session", () => {
  it("always finds one, for every level, phase and week", () => {
    for (const level of LEVELS) {
      for (const phase of PHASES) {
        for (let w = 1; w <= 16; w++) {
          const pick = pickIntervalSession(query(level, phase, w))!;
          expect(pick, `${level}/${phase}/w${w}`).toBeTruthy();
          expect(pick.session.level).toBe(level);
          expect(pick.session.phase).toBe(phase);
        }
      }
    }
  });

  it("works through the whole pool before repeating", () => {
    for (const level of LEVELS) {
      const pool = INTERVAL_SESSIONS.filter((s) => s.level === level && s.phase === "base");
      const seen = Array.from(
        { length: pool.length },
        (_, i) => pickIntervalSession(query(level, "base", i + 1))!.session.slug,
      );
      expect(new Set(seen).size, level).toBe(pool.length);
    }
  });

  it("is never steered by a station weakness — there are no stations in it", () => {
    const tiers = { wall_balls: 1, ski_erg: 3, row: 3 };
    for (let w = 1; w <= 8; w++) {
      const pick = pickIntervalSession(query("advanced", "build", w, { stationTiers: tiers }))!;
      expect(pick.targeted).toBe(false);
    }
  });

  it("still works without a gym — running needs nothing", () => {
    for (const level of LEVELS) {
      for (const phase of PHASES) {
        const pick = pickIntervalSession(query(level, phase, 1, { equipment: "home_minimal" }));
        expect(pick, `${level}/${phase}`).toBeTruthy();
        expect(pick!.session.level).toBe(level);
      }
    }
  });
});

describe("intervals in a generated plan", () => {
  const profile: AthleteProfile = {
    id: "p",
    division: "pro",
    experience_level: "advanced",
    five_k_seconds: 1020,
    station_estimates: {},
    training_days_per_week: 6,
    equipment_access: "full_gym",
  };
  const state = initialAthleteState(profile);
  const zones = state.pace_zones;
  const plan = generatePlan({ profile, state, library: DEMO_LIBRARY, weeksToRace: 16 });
  const blocks = plan.phases
    .flatMap((ph) => ph.weeks)
    .flatMap((w) => w.sessions.filter((s) => s.session_type === "run_intervals"))
    .flatMap((s) => s.blocks.filter((b) => b.block_type === "main"));

  it("prescribes the athlete's own level", () => {
    expect(blocks.length).toBeGreaterThan(3);
    const own = new Set(
      INTERVAL_SESSIONS.filter((s) => s.level === "advanced").map((s) => s.slug),
    );
    for (const b of blocks) expect(own.has(b.slug!), b.slug).toBe(true);
  });

  it("carries the reason onto the card, and the pace of the zone it is run at", () => {
    for (const b of blocks) {
      expect(b.load_adjustments.variant_why?.length ?? 0).toBeGreaterThan(30);
      const session = INTERVAL_SESSIONS.find((s) => s.slug === b.slug)!;
      if (session.pace_zone === "mixed") {
        // No single number describes an alternation or a progression, so the
        // card shows none rather than one that is wrong.
        expect(b.load_adjustments.pace_sec_km).toBeUndefined();
      } else {
        expect(b.load_adjustments.pace_sec_km ?? 0).toBeGreaterThan(0);
        expect(b.load_adjustments.pace_zone).toBe(session.pace_zone);
      }
    }
  });

  it("shows a threshold session the threshold pace, not the interval pace", () => {
    // The bug this whole field exists for: every session in the catalogue
    // inherited one zone from its session TYPE, so a 25-minute block at LT2
    // was prescribed at 3 k-rep pace.
    const lt2 = blocks.filter(
      (b) => INTERVAL_SESSIONS.find((s) => s.slug === b.slug)?.pace_zone === "tempo_sec_km",
    );
    expect(lt2.length).toBeGreaterThan(0);
    for (const b of lt2) {
      expect(b.load_adjustments.pace_sec_km).toBe(zones.tempo_sec_km);
      expect(b.load_adjustments.pace_sec_km).not.toBe(zones.interval_sec_km);
    }
  });
});
