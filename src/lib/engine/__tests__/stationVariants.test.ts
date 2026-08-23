import { describe, it, expect } from "vitest";
import {
  generatePlan,
  initialAthleteState,
  pickStationVariant,
  STATION_VARIANTS,
  type AthleteProfile,
  type PhaseType,
} from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";

const pick = (phase: PhaseType, weekNumber: number, over: Record<string, unknown> = {}) =>
  pickStationVariant({
    sessionType: "station_work",
    phase,
    weekNumber,
    equipment: "full_gym",
    ...over,
  });

describe("the station catalogue", () => {
  it("covers every phase with the shapes that phase is for", () => {
    const byPhase = (p: PhaseType) => STATION_VARIANTS.filter((v) => v.phases.includes(p));
    expect(byPhase("base")).toHaveLength(3);
    expect(byPhase("build")).toHaveLength(3);
    expect(byPhase("peak")).toHaveLength(3);
    expect(byPhase("taper")).toHaveLength(2);
  });

  it("has a library block behind every variant", () => {
    for (const v of STATION_VARIANTS) {
      expect(
        DEMO_LIBRARY.some((b) => (b.slug ?? b.id) === v.slug),
        `no block for ${v.slug}`,
      ).toBe(true);
    }
  });

  it("keeps overload work in the base and priming in the taper", () => {
    expect(STATION_VARIANTS.find((v) => v.slug === "sv_overload_sled_grip")?.phases).toEqual(["base"]);
    expect(STATION_VARIANTS.find((v) => v.slug === "sv_neural_priming")?.phases).toEqual(["taper"]);
    // A race-week session must never surface in a build block.
    for (let w = 1; w <= 8; w++) {
      expect(pick("build", w)?.variant.slug).not.toBe("sv_neural_priming");
      expect(pick("base", w)?.variant.slug).not.toBe("sv_engine_gauntlet");
    }
  });

  it("gives every variant a reason a coach would give", () => {
    for (const v of STATION_VARIANTS) expect(v.why.length, v.slug).toBeGreaterThan(30);
  });
});

describe("pickStationVariant", () => {
  it("rotates through the phase's shapes", () => {
    const slugs = new Set(Array.from({ length: 6 }, (_, i) => pick("build", i + 1)?.variant.slug));
    expect(slugs.size).toBeGreaterThan(1);
  });

  it("leaves out the erg sessions when there is no erg", () => {
    for (let w = 1; w <= 8; w++) {
      expect(pick("build", w, { equipment: "home_minimal" })?.variant.needs_erg).toBeFalsy();
      expect(pick("base", w, { equipment: "home_minimal" })?.variant.needs_erg).toBeFalsy();
    }
  });

  it("aims every second week at the weakest station", () => {
    const tiers = { wall_balls: 1, sled_push: 3, row: 3 };
    const picks = Array.from({ length: 6 }, (_, i) => pick("peak", i + 1, { stationTiers: tiers }));
    const targeted = picks.filter((p) => p?.targeted);
    expect(targeted.length).toBe(3);
    expect(targeted.every((p) => p?.variant.station === "wall_balls")).toBe(true);
  });

  it("reads a stated weakness too", () => {
    const p = pick("build", 1, { weaknesses: ["Laktattoleranz am Ski"] });
    expect(p?.targeted).toBe(true);
    expect(p?.variant.slug).toBe("sv_erg_threshold");
  });
});

describe("station sessions in a generated plan", () => {
  const profile: AthleteProfile = {
    id: "t",
    division: "open",
    experience_level: "intermediate",
    five_k_seconds: 1350,
    station_estimates: {},
    training_days_per_week: 5,
    equipment_access: "full_gym",
    weaknesses: ["Wall Balls"],
  };
  const state = initialAthleteState(profile);
  state.station_tiers.wall_balls = 1;
  const plan = generatePlan({ profile, state, library: DEMO_LIBRARY, weeksToRace: 16 });
  const weeks = plan.phases.flatMap((ph) => ph.weeks.map((w) => ({ phase: ph.phase_type, w })));

  it("puts a station session in the build and peak blocks, not only in the base", () => {
    for (const phase of ["base", "build", "peak"] as const) {
      const withStation = weeks.filter(
        (x) => x.phase === phase && x.w.sessions.some((s) => s.session_type === "station_work"),
      );
      expect(withStation.length, `${phase} has no station session`).toBeGreaterThan(0);
    }
  });

  it("names the variant and its reason on the block", () => {
    const blocks = weeks.flatMap((x) =>
      x.w.sessions
        .filter((s) => s.session_type === "station_work")
        .flatMap((s) => s.blocks.filter((b) => b.load_adjustments.variant_name)),
    );
    expect(blocks.length).toBeGreaterThan(5);
    for (const b of blocks) expect(b.load_adjustments.variant_why?.length).toBeGreaterThan(30);
  });

  it("renders explicit division loads wherever a station session names a weight", () => {
    // Since stationSessions.ts landed, the station work of a generated plan
    // comes from the levelled catalogue rather than from this variant list —
    // the loads still have to be explicit per division (PP2), which is what
    // this ever tested.
    const loaded = weeks
      .flatMap((x) => x.w.sessions.filter((s) => s.session_type === "station_work"))
      .flatMap((s) => s.blocks)
      .flatMap((b) => b.content as { load_by_division?: Record<string, string> }[])
      .filter((line) => line.load_by_division);
    expect(loaded.length).toBeGreaterThan(5);
    for (const line of loaded) {
      expect(line.load_by_division?.open).toMatch(/kg/);
      expect(line.load_by_division?.pro).toMatch(/kg/);
    }
  });
});
