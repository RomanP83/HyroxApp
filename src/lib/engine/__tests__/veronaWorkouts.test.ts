import { describe, it, expect } from "vitest";
import {
  VERONA_WORKOUTS,
  collectionCoverage,
  generatePlan,
  initialAthleteState,
  pickCollectionWorkout,
  renderCollectionWorkout,
  type AthleteProfile,
  type GeneratedPlan,
} from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";

const profile = (over: Partial<AthleteProfile> = {}): AthleteProfile =>
  ({
    id: "p",
    division: "open",
    experience_level: "elite",
    five_k_seconds: 1150,
    station_estimates: {},
    training_days_per_week: 6,
    equipment_access: "full_gym",
    ...over,
  }) as AthleteProfile;

const plan = (p: AthleteProfile): GeneratedPlan =>
  generatePlan({ profile: p, state: initialAthleteState(p), library: DEMO_LIBRARY, weeksToRace: 12 });

const sessionsOf = (pl: GeneratedPlan) =>
  pl.phases.flatMap((ph) => ph.weeks.map((w) => ({ ph: ph.phase_type, w }))).flatMap(({ ph, w }) =>
    w.sessions.map((s) => ({ phase: ph, week: w.week_number, s })),
  );

describe("the Verona catalogue", () => {
  it("has unique vr_ slugs, the original name, a reason and content", () => {
    const slugs = VERONA_WORKOUTS.map((w) => w.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const w of VERONA_WORKOUTS) {
      expect(w.slug, w.slug).toMatch(/^vr_/);
      expect(w.original.length, w.slug).toBeGreaterThan(5);
      expect(w.why.length, w.slug).toBeGreaterThan(30);
      expect(w.lines.length, w.slug).toBeGreaterThan(0);
      expect(w.phases.length, w.slug).toBeGreaterThan(0);
    }
  });

  it("covers the core session types in every training phase", () => {
    const cov = collectionCoverage();
    for (const phase of ["base", "build", "peak"]) {
      for (const t of ["run_intervals", "long_run", "run_easy", "strength", "station_work", "compromised_run"]) {
        expect(cov[phase], `${phase}/${t}`).toContain(t);
      }
    }
    expect(cov.taper).toEqual(expect.arrayContaining(["run_intervals", "strength", "station_work"]));
  });

  it("renders a rounds header only when there are rounds", () => {
    const cutdown = VERONA_WORKOUTS.find((w) => w.slug === "vr_cutdown")!;
    expect(renderCollectionWorkout(cutdown)).toEqual(cutdown.lines);
    const pull = VERONA_WORKOUTS.find((w) => w.slug === "vr_pull_bbj")!;
    expect(renderCollectionWorkout(pull)[0].exercise).toBe("6 rounds");
  });
});

describe("pickCollectionWorkout", () => {
  const q = { sessionType: "compromised_run" as const, phase: "build" as const, weekNumber: 3, equipment: "full_gym" as const };

  it("does nothing for the standard collection", () => {
    expect(pickCollectionWorkout("standard", q)).toBeNull();
    expect(pickCollectionWorkout(null, q)).toBeNull();
  });

  it("keeps a situational session out unless a weakness names it", () => {
    const slugs = (weaknesses?: string[]) =>
      Array.from({ length: 12 }, (_, i) =>
        pickCollectionWorkout("verona", { ...q, weekNumber: i + 1, weaknesses })?.variant.slug,
      );
    expect(slugs()).not.toContain("vr_calf_friendly");
    expect(slugs(["Wade"])).toContain("vr_calf_friendly");
  });

  it("never gives an erg session to a home athlete", () => {
    for (let wk = 1; wk <= 12; wk++) {
      const pick = pickCollectionWorkout("verona", { ...q, phase: "peak", weekNumber: wk, equipment: "home_minimal" });
      if (pick) expect(pick.variant.needs_erg, pick.variant.slug).toBeFalsy();
    }
  });

  it("returns null where the collection has nothing (the library decides)", () => {
    expect(pickCollectionWorkout("verona", { ...q, sessionType: "mobility" })).toBeNull();
    expect(pickCollectionWorkout("verona", { ...q, sessionType: "compromised_run", phase: "taper" })).toBeNull();
  });
});

describe("planning with the Verona collection", () => {
  it("leaves a standard plan exactly as it was", () => {
    const a = plan(profile());
    const b = plan(profile({ workout_collection: "standard" }));
    expect(b).toEqual(a);
    expect(JSON.stringify(a)).not.toContain('"vr_');
  });

  it("fills covered slots from the collection, and only those", () => {
    const pl = plan(profile({ workout_collection: "verona" }));
    const all = sessionsOf(pl);
    const cov = collectionCoverage();
    let fromCollection = 0;
    for (const { phase, s } of all) {
      const main = s.blocks.find((b) => b.block_type === "main");
      const covered = (cov[phase] ?? []).includes(s.session_type);
      if (!main) continue;
      if (covered) {
        expect(main.slug, `${phase}/${s.session_type}`).toMatch(/^vr_/);
        expect(main.load_adjustments.collection_original?.length).toBeGreaterThan(5);
        fromCollection++;
      } else {
        expect(main.slug ?? "", `${phase}/${s.session_type}`).not.toMatch(/^vr_/);
      }
    }
    expect(fromCollection).toBeGreaterThan(20);
  });

  it("changes only the content after base — base gains the weekly game day", () => {
    const strip = (pl: GeneratedPlan, phases: string[]) =>
      sessionsOf(pl)
        .filter(({ phase }) => phases.includes(phase))
        .map(({ week, s }) => [week, s.day_hint, s.day_slot, s.session_type, s.planned_duration_min, s.intensity_rpe_target]);
    const later = ["build", "peak", "taper"];
    expect(strip(plan(profile({ workout_collection: "verona" })), later)).toEqual(strip(plan(profile()), later));

    const baseWeeks = (pl: GeneratedPlan) => pl.phases.find((p) => p.phase_type === "base")!.weeks;
    for (const w of baseWeeks(plan(profile()))) {
      expect(w.sessions.some((s) => s.session_type === "compromised_run")).toBe(false);
    }
    for (const w of baseWeeks(plan(profile({ workout_collection: "verona" })))) {
      const game = w.sessions.find((s) => s.session_type === "compromised_run");
      expect(game, `week ${w.week_number}`).toBeTruthy();
      expect(game!.blocks.find((b) => b.block_type === "main")?.slug).toMatch(/^vr_(bbj_technique_erg|ergs_burpees)$/);
      const hard = w.sessions.filter((s) =>
        ["run_intervals", "compromised_run", "full_sim", "benchmark"].includes(s.session_type),
      );
      expect(hard.length).toBeLessThanOrEqual(2);
    }
  });

  it("plans Strength A and B in the same week when two strength days are set", () => {
    const pl = plan(profile({ workout_collection: "verona", strength_per_week: 2, preferred_strength_days: [1, 3] }));
    let weeksWithTwo = 0;
    for (const { phase, w } of pl.phases.flatMap((ph) => ph.weeks.map((w) => ({ phase: ph.phase_type, w })))) {
      const str = w.sessions.filter((s) => s.session_type === "strength" && s.day_slot === "am").sort((a, b) => a.day_hint - b.day_hint);
      if (phase === "taper") {
        expect(str.length).toBe(1);
        continue;
      }
      if (str.length < 2) continue;
      weeksWithTwo++;
      expect(str.map((s) => s.day_hint)).toEqual([1, 3]);
      expect(str.map((s) => s.blocks.find((b) => b.block_type === "main")?.slug)).toEqual(["vr_strength_a", "vr_strength_b"]);
    }
    expect(weeksWithTwo).toBeGreaterThan(5);
  });

  it("puts the game day on the pinned weekday", () => {
    const pl = plan(profile({ workout_collection: "verona", preferred_game_day: 6, preferred_long_run_day: 7 }));
    for (const w of pl.phases.flatMap((ph) => ph.weeks)) {
      const sim = w.sessions.find((s) => s.session_type === "full_sim");
      const firstGame = sim ?? w.sessions.filter((s) => s.session_type === "compromised_run").sort((a, b) => a.sort_order - b.sort_order)[0];
      if (!firstGame) continue;
      const onSaturday = w.sessions.filter((s) => s.day_hint === 6 && s.day_slot === "am").map((s) => s.session_type);
      expect(onSaturday, `week ${w.week_number}`).toContain(sim ? "full_sim" : "compromised_run");
    }
  });

  it("alternates Strength A and B, and splits a week's two easy runs", () => {
    const pl = plan(profile({ workout_collection: "verona", doubles_per_week: 2 }));
    const strength = new Set<string>();
    const easyByWeek = new Map<number, string[]>();
    for (const { week, phase, s } of sessionsOf(pl)) {
      const slug = s.blocks.find((b) => b.block_type === "main")?.slug ?? "";
      if (s.session_type === "strength" && phase !== "taper") strength.add(slug);
      if (s.session_type === "run_easy") easyByWeek.set(week, [...(easyByWeek.get(week) ?? []), slug]);
    }
    expect(strength).toEqual(new Set(["vr_strength_a", "vr_strength_b"]));
    const twice = [...easyByWeek.values()].filter((x) => x.length >= 2);
    expect(twice.length).toBeGreaterThan(0);
    for (const x of twice) expect(new Set(x.slice(0, 2)).size, x.join()).toBe(2);
  });

  it("is deterministic", () => {
    const p = profile({ workout_collection: "verona" });
    expect(plan(p)).toEqual(plan(p));
  });
});
