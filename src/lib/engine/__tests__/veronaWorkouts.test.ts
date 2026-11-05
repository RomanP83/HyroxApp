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

  it("does not change the shape of the week — only its content", () => {
    const strip = (pl: GeneratedPlan) =>
      sessionsOf(pl).map(({ week, s }) => [week, s.day_hint, s.day_slot, s.session_type, s.planned_duration_min, s.intensity_rpe_target]);
    expect(strip(plan(profile({ workout_collection: "verona" })))).toEqual(strip(plan(profile())));
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
