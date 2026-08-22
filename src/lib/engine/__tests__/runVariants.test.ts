import { describe, it, expect } from "vitest";
import {
  fillSession,
  generatePlan,
  initialAthleteState,
  pickRunVariant,
  RUN_VARIANTS,
  weakestStation,
  distributeSlots,
  type AthleteProfile,
  type PhaseType,
  type RunSessionType,
} from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";

const profile = (over: Partial<AthleteProfile> = {}): AthleteProfile => ({
  id: "t",
  division: "open",
  experience_level: "intermediate",
  five_k_seconds: 1350,
  station_estimates: {},
  training_days_per_week: 5,
  equipment_access: "full_gym",
  ...over,
});

const pick = (
  sessionType: RunSessionType,
  phase: PhaseType,
  weekNumber: number,
  over: Partial<Parameters<typeof pickRunVariant>[0]> = {},
) =>
  pickRunVariant({
    sessionType,
    phase,
    weekNumber,
    equipment: "full_gym",
    ...over,
  });

describe("the variant catalogue", () => {
  it("covers all four core sessions, with the prescribed shapes", () => {
    const byType = (t: RunSessionType) => RUN_VARIANTS.filter((v) => v.session_type === t);
    expect(byType("long_run")).toHaveLength(3);
    expect(byType("run_easy")).toHaveLength(3);
    expect(byType("run_intervals")).toHaveLength(4);
    expect(byType("compromised_run")).toHaveLength(4);
  });

  it("gives every variant a phase, a name and a reason a coach would give", () => {
    for (const v of RUN_VARIANTS) {
      expect(v.phases.length, v.slug).toBeGreaterThan(0);
      expect(v.name.length, v.slug).toBeGreaterThan(4);
      expect(v.why.length, v.slug).toBeGreaterThan(20);
    }
  });

  it("has a library block behind every variant", () => {
    for (const v of RUN_VARIANTS) {
      expect(
        DEMO_LIBRARY.some((b) => (b.slug ?? b.id) === v.slug),
        `no block for ${v.slug}`,
      ).toBe(true);
    }
  });
});

describe("pickRunVariant", () => {
  it("is deterministic — the same week always gets the same session", () => {
    const a = pick("run_intervals", "build", 5);
    const b = pick("run_intervals", "build", 5);
    expect(a?.variant.slug).toBe(b?.variant.slug);
  });

  it("rotates instead of repeating one shape all cycle", () => {
    const slugs = new Set(
      Array.from({ length: 6 }, (_, i) => pick("run_intervals", "build", i + 1)?.variant.slug),
    );
    expect(slugs.size).toBeGreaterThan(1);
  });

  it("keeps a variant out of the phases it does not belong in", () => {
    // Compromised running does not exist in base at all, and the short reps
    // of a taper have no place in a base block.
    for (let w = 1; w <= 8; w++) {
      expect(pick("run_intervals", "base", w)?.variant.slug).not.toBe("iv_30_30");
      expect(pick("long_run", "base", w)?.variant.slug).not.toBe("lr_progression");
    }
  });

  it("never prescribes an erg session to an athlete without one", () => {
    for (let w = 1; w <= 8; w++) {
      expect(pick("run_easy", "build", w, { equipment: "home_minimal" })?.variant.needs_erg).toBeFalsy();
      expect(
        pick("compromised_run", "build", w, { equipment: "home_minimal" })?.variant.needs_erg,
      ).toBeFalsy();
    }
  });

  it("aims every second week at the weakest station, and varies the weeks between", () => {
    const tiers = { sled_push: 1, row: 3, wall_balls: 3 };
    const picks = Array.from({ length: 6 }, (_, i) =>
      pick("compromised_run", "build", i + 1, { stationTiers: tiers }),
    );
    const targeted = picks.filter((p) => p?.targeted);
    expect(targeted.length).toBe(3);
    expect(targeted.every((p) => p?.variant.station === "sled_push")).toBe(true);
    // The weeks in between deliberately avoid it, or the "focus" would just be
    // the same session every week.
    const between = picks.filter((p) => !p?.targeted);
    expect(between.every((p) => p?.variant.station !== "sled_push")).toBe(true);
  });

  it("reads a stated weakness, not just the station tiers", () => {
    const p = pick("run_intervals", "build", 1, { weaknesses: ["Laktattoleranz"] });
    expect(p?.targeted).toBe(true);
    expect(p?.variant.slug).toBe("iv_cruise_2k");
  });

  it("finds the weakest station deterministically", () => {
    expect(weakestStation({ sled_push: 2, row: 1, wall_balls: 3 })).toBe("row");
    expect(weakestStation({ a: 2, b: 2 } as never)).toBe("a");
    expect(weakestStation(undefined)).toBeNull();
  });
});

describe("variants in a generated plan", () => {
  const p = profile({ weaknesses: ["Sled Push"] });
  const state = initialAthleteState(p);
  state.station_tiers.sled_push = 1;
  const plan = generatePlan({ profile: p, state, library: DEMO_LIBRARY, weeksToRace: 12 });
  const runBlocks = plan.phases.flatMap((ph) =>
    ph.weeks.flatMap((w) =>
      w.sessions.flatMap((s) => s.blocks.filter((b) => b.load_adjustments.variant_name)),
    ),
  );

  it("names the chosen variant on the block, with its reason", () => {
    expect(runBlocks.length).toBeGreaterThan(20);
    for (const b of runBlocks) {
      expect(b.load_adjustments.variant_why?.length).toBeGreaterThan(20);
    }
  });

  it("uses several different shapes across the cycle", () => {
    const names = new Set(runBlocks.map((b) => b.load_adjustments.variant_name));
    expect(names.size).toBeGreaterThanOrEqual(6);
  });

  it("marks the sessions that were aimed at the athlete's weak station", () => {
    const targeted = runBlocks.filter((b) => b.load_adjustments.variant_targeted);
    expect(targeted.length).toBeGreaterThan(0);
  });

  it("still fills a session when no phase is known (the demo's fallback path)", () => {
    const slot = distributeSlots({
      phase: "build",
      trainingDays: 5,
      weekInPhase: 1,
      isDeload: false,
      isBenchmark: false,
    }).find((s) => s.session_type === "run_intervals")!;
    const blocks = fillSession(slot, p, state, DEMO_LIBRARY, 3);
    expect(blocks.some((b) => b.block_type === "main")).toBe(true);
  });
});
