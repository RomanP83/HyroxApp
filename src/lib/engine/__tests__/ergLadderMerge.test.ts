import { describe, it, expect } from "vitest";
import { fillSession, initialAthleteState, type AthleteProfile, type WorkoutBlock } from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";

// After merging the levelled station catalogue, the erg ladder into a hundred
// wall balls still wins a build week aimed at a weak wall-ball station.
describe("the erg ladder survives the levelled station catalogue", () => {
  const profile = {
    id: "p",
    division: "open",
    experience_level: "intermediate",
    five_k_seconds: 1300,
    station_estimates: {},
    training_days_per_week: 5,
    equipment_access: "full_gym",
  } as AthleteProfile;
  const ladder: WorkoutBlock = {
    id: "sv_erg_ladder_wallballs",
    slug: "sv_erg_ladder_wallballs",
    block_type: "main",
    station: "wall_balls",
    content: [{ exercise: "SkiErg or RowErg, 5 × 1000 m" }],
    equipment_variant: "gym",
    difficulty_tier: 3,
    session_types: ["station_work"],
    tags: [],
  };
  const library = DEMO_LIBRARY.some((b) => b.slug === ladder.slug) ? DEMO_LIBRARY : [...DEMO_LIBRARY, ladder];
  const slot = { session_type: "station_work" as const, day_hint: 4, day_slot: "am" as const, intensity_rpe_target: 7, planned_duration_min: 60, sort_order: 0 };

  it("is chosen in a targeted build week when wall balls are the weak spot", () => {
    const state = initialAthleteState(profile);
    state.station_tiers = { ...state.station_tiers, wall_balls: 1 };
    const slugs = [1, 3, 5, 7, 9].map(
      (w) => fillSession(slot, profile, state, library, w, "build").find((b) => b.block_type === "main")?.block_id,
    );
    expect(slugs).toContain("sv_erg_ladder_wallballs");
  });

  it("leaves the levelled catalogue in charge otherwise", () => {
    const state = initialAthleteState(profile);
    const main = fillSession(slot, profile, state, library, 2, "build").find((b) => b.block_type === "main");
    expect(main?.block_id).not.toBe("sv_erg_ladder_wallballs");
  });
});
