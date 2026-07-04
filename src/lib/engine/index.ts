// Public engine surface. Import from "@/lib/engine".
export * from "./types";
export * from "./constants";
export * from "./macro";
export * from "./micro";
export * from "./fill";
export * from "./weeklyGoal";
export * from "./prognosis";
export * from "./generate";
export * from "./adaptive";

import type { AthleteProfile, AthleteState } from "./types";
import { defaultPaceZones, defaultStationTiers } from "./constants";
import { predictRaceTime } from "./prognosis";

/** Build the initial athlete_state at onboarding, before any session is logged. */
export function initialAthleteState(profile: AthleteProfile): AthleteState {
  const base: AthleteState = {
    acute_load_7d: 0,
    chronic_load_28d: 0,
    acwr: 1.0,
    pace_zones: defaultPaceZones(profile.five_k_seconds),
    station_tiers: defaultStationTiers(profile.experience_level),
    predicted_race_time_sec: null,
  };
  base.predicted_race_time_sec = predictRaceTime(profile, base, []);
  return base;
}
