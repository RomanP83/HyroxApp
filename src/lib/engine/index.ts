// Public engine surface. Import from "@/lib/engine".
export * from "./types";
export * from "./constants";
export * from "./macro";
export * from "./season";
export * from "./raceCalendar";
export * from "./running";
export * from "./runVariants";
export * from "./catalogue";
export * from "./compromisedSessions";
export * from "./stationSessions";
export * from "./intervalSessions";
export * from "./stationVariants";
export * from "./strengthVariants";
export * from "./micro";
export * from "./fill";
export * from "./weeklyGoal";
export * from "./raceModel";
export * from "./prognosis";
export * from "./generate";
export * from "./adaptive";
export * from "./feedback";

import type { AthleteProfile, AthleteState } from "./types";
import { defaultPaceZones, defaultStationTiers } from "./constants";
import { predictRaceTime } from "./prognosis";

/** Build the initial athlete_state at onboarding, before any session is logged. */
export function initialAthleteState(profile: AthleteProfile): AthleteState {
  const zones = defaultPaceZones(profile.five_k_seconds);
  const base: AthleteState = {
    acute_load_7d: 0,
    chronic_load_28d: 0,
    acwr: 1.0,
    pace_zones: zones,
    station_tiers: defaultStationTiers(profile.experience_level),
    predicted_race_time_sec: null,
    strength_modifier: 1.0,
    pace_zones_ref: { ...zones },
    pace_ref_at: null, // set by the first micro-calibration run
  };
  base.predicted_race_time_sec = predictRaceTime(profile, base, []);
  return base;
}
