// Changing the level is a new goal, not a fresh start.
//
// The plan's content follows the level closely — TRAINING_MIX is keyed on it,
// and all three session catalogues pick by it — so raising the target has to
// change the weeks. What it must NOT touch is the calibration: pace zones and
// station tiers come from what the athlete has actually logged, and rebuilding
// them from the onboarding 5 k time would throw months of that away.
import { describe, it, expect } from "vitest";
import {
  generatePlan,
  initialAthleteState,
  TRAINING_MIX,
  type AthleteProfile,
  type AthleteState,
} from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";

const profile = (over: Partial<AthleteProfile> = {}): AthleteProfile => ({
  id: "t",
  division: "open",
  experience_level: "intermediate",
  five_k_seconds: 1350,
  station_estimates: {},
  training_days_per_week: 6,
  doubles_per_week: 2,
  equipment_access: "full_gym",
  ...over,
});

/** A state that has moved a long way from where onboarding would have put it. */
function calibrated(): AthleteState {
  const base = initialAthleteState(profile());
  return {
    ...base,
    pace_zones: { easy_sec_km: 300, race_sec_km: 250, tempo_sec_km: 232, interval_sec_km: 215 },
    station_tiers: { ...base.station_tiers, wall_balls: 3, sled_push: 1 },
    strength_modifier: 1.15,
  };
}

describe("changing the level", () => {
  const state = calibrated();

  it("leaves the calibration exactly as it was", () => {
    // The engine reads the state; it never writes it. A rebase passes the live
    // athlete_state row straight through, which is what keeps this true.
    const before = JSON.parse(JSON.stringify(state));
    generatePlan({
      profile: profile({ experience_level: "elite" }),
      state,
      library: DEMO_LIBRARY,
      weeksToRace: 12,
    });
    expect(state).toEqual(before);
  });

  it("builds a different plan than the level it replaced", () => {
    const shape = (level: AthleteProfile["experience_level"]) =>
      generatePlan({
        profile: profile({ experience_level: level }),
        state,
        library: DEMO_LIBRARY,
        weeksToRace: 12,
      })
        .phases.flatMap((p) => p.weeks)
        .flatMap((w) => w.sessions)
        .map((s) => `${s.day_hint}${s.day_slot}:${s.session_type}:${s.planned_duration_min}`)
        .join("|");
    // Not a share comparison: at eight sessions a week the difference between
    // a 30% and a 35% target can round to the same slot count, and the mix's
    // own conformance is tested against the table in structure.test.ts. What
    // must hold here is simply that raising the level rebuilds the plan.
    expect(shape("elite")).not.toBe(shape("beginner"));
    expect(shape("elite")).not.toBe(shape("intermediate"));
  });

  it("prescribes the new level's own sessions", () => {
    const slugs = (level: AthleteProfile["experience_level"]) =>
      new Set(
        generatePlan({
          profile: profile({ experience_level: level }),
          state,
          library: DEMO_LIBRARY,
          weeksToRace: 12,
        })
          .phases.flatMap((p) => p.weeks)
          .flatMap((w) => w.sessions)
          .flatMap((s) => s.blocks)
          .map((b) => b.slug)
          .filter((slug): slug is string => Boolean(slug?.startsWith("cr_") || slug?.startsWith("sw_"))),
      );
    const elite = slugs("elite");
    const beginner = slugs("beginner");
    expect(elite.size).toBeGreaterThan(0);
    // No overlap at all: the catalogues are level-specific by construction.
    expect([...elite].filter((s) => beginner.has(s))).toEqual([]);
  });
});
