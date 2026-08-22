// ============================================================================
// Running architecture (the 50-60% of a Hyrox that is running).
//
// One place for the four core run sessions and the polarised distribution they
// are supposed to produce. Everything downstream — durations, pace targets, the
// compromised-running buffer, the weekly volume readout — reads from here, so
// the running model is one table a coach can argue with, not numbers scattered
// across the generator.
//
// Intensity distribution is measured by DISTANCE IN ZONE, not by session label.
// An interval session is not "100% hard": the warm-up, the jog between reps and
// the cool-down are aerobic. Counting only the working portion is what makes a
// week of 1 long + 1 easy + 1 interval + 1 compromised land at ~75-80% easy —
// the polarised target — instead of a meaningless 50/50 by session count.
// ============================================================================

import type { PaceZones, PhaseType, SessionType } from "./types";

export type RunSessionType =
  | "long_run"
  | "run_easy"
  | "run_intervals"
  | "compromised_run"
  | "full_sim";

export interface RunSpec {
  /** Heart-rate band, as prescribed. */
  hr_zone: string;
  /** Which pace zone of athlete_state drives the target. */
  pace_zone: keyof PaceZones;
  /** Planned minutes per phase — the long run shortens as the race nears. */
  duration_by_phase: Record<PhaseType, number>;
  /** Session distance the prescription expects, for the UI. */
  distance_hint: string;
  /**
   * Share of the session's minutes actually spent running. Intervals carry
   * rest, compromised running carries stations — the rest is not mileage.
   */
  running_fraction: number;
  /** Share of the session's DISTANCE spent above threshold (Zone 4/5-ish). */
  hard_fraction: number;
  focus: string;
  pace_note: string;
}

export const RUN_SPECS: Record<RunSessionType, RunSpec> = {
  long_run: {
    hr_zone: "Zone 2 · 65-75% HRmax",
    pace_zone: "easy_sec_km",
    duration_by_phase: { base: 80, build: 70, peak: 60, taper: 45 },
    distance_hint: "12-18 km",
    running_fraction: 1,
    hard_fraction: 0,
    focus: "Mitochondrial density, fat metabolism, tendon economy.",
    pace_note: "Conversational — 60-90 s/km slower than your 5k pace. If you cannot talk, slow down.",
  },
  run_easy: {
    hr_zone: "Zone 1-2 · below 70% HRmax",
    pace_zone: "easy_sec_km",
    duration_by_phase: { base: 40, build: 40, peak: 35, taper: 30 },
    distance_hint: "5-8 km",
    running_fraction: 1,
    hard_fraction: 0,
    focus: "Circulation and active lactate clearance — this one is recovery, not training.",
    pace_note: "Very easy. Slower than it feels right; the point is blood flow, not fitness.",
  },
  run_intervals: {
    hr_zone: "Zone 4-5 · 88-95% HRmax",
    pace_zone: "interval_sec_km",
    duration_by_phase: { base: 50, build: 55, peak: 55, taper: 40 },
    distance_hint: "8-10 km total",
    running_fraction: 0.75,
    hard_fraction: 0.45,
    focus: "Lactate tolerance, VO₂max, speed reserve.",
    pace_note: "Reps at 3k-5k race effort. Full recovery between — quality over quantity.",
  },
  compromised_run: {
    hr_zone: "Zone 3-4 · 80-90% HRmax",
    pace_zone: "race_sec_km",
    duration_by_phase: { base: 0, build: 55, peak: 60, taper: 45 },
    distance_hint: "45-75 min",
    running_fraction: 0.6,
    hard_fraction: 0.6,
    focus: "Running specifically under pre-fatigue — the heavy-legs feeling of the real race.",
    pace_note: "Target race pace out of the station. Never sprint out of a station into Zone 5.",
  },
  full_sim: {
    hr_zone: "Zone 3-4 · 80-90% HRmax",
    pace_zone: "race_sec_km",
    duration_by_phase: { base: 90, build: 90, peak: 90, taper: 60 },
    distance_hint: "8 × 1 km + stations",
    running_fraction: 0.5,
    hard_fraction: 0.7,
    focus: "The whole thing, rehearsed: pacing, transitions, nutrition.",
    pace_note: "Hold your goal split. The simulation is where pacing mistakes are cheap.",
  },
};

export function isRunSession(type: SessionType): type is RunSessionType {
  return type in RUN_SPECS;
}

export function runSpec(type: SessionType): RunSpec | null {
  return isRunSession(type) ? RUN_SPECS[type] : null;
}

// ── The polarised targets the week is measured against ──────────────────────

export const RUNNING_TARGETS = {
  weekly_km_min: 30,
  weekly_km_max: 50,
  runs_per_week_min: 3,
  runs_per_week_max: 4,
  /** Share of weekly running distance that stays aerobic (the 80/20 rule). */
  easy_share_min: 0.75,
  easy_share_max: 0.85,
} as const;

/**
 * The polarised window is not one number across the year. A base block with no
 * compromised running is meant to be almost all aerobic; a peak block that
 * rehearses the race is meant to run hot. The build block is where the classic
 * 75-85% applies.
 */
export const POLARISATION_BY_PHASE: Record<PhaseType, [number, number]> = {
  base: [0.8, 0.95],
  build: [0.75, 0.85],
  peak: [0.6, 0.8],
  taper: [0.7, 0.9],
};

/** Weekly kilometres per phase — a taper is supposed to be short. */
export const VOLUME_BY_PHASE: Record<PhaseType, [number, number]> = {
  base: [30, 50],
  build: [30, 50],
  peak: [30, 50],
  taper: [15, 30],
};

/**
 * Compromised running out of a station: the first 400 m carry a buffer on top
 * of the flat target split, and the first 200 m are for finding rhythm and
 * breathing again — not for making up time.
 */
export const COMPROMISED_OPENING = {
  buffer_sec_km: 20, // the prescription's +15-25 s, one number the plan can render
  buffer_distance_m: 400,
  stabilise_distance_m: 200,
} as const;

export function compromisedOpeningPace(racePaceSecKm: number): number {
  return racePaceSecKm + COMPROMISED_OPENING.buffer_sec_km;
}

/** Planned kilometres of a session, from its minutes and the pace it runs at. */
export function plannedDistanceKm(
  type: SessionType,
  durationMin: number,
  zones: PaceZones,
): number {
  const spec = runSpec(type);
  if (!spec) return 0;
  const pace = zones[spec.pace_zone];
  if (!pace || pace <= 0) return 0;
  const runningMinutes = durationMin * spec.running_fraction;
  return Math.round(((runningMinutes * 60) / pace) * 10) / 10;
}

export interface WeeklyRunSummary {
  runs: number;
  total_km: number;
  easy_km: number;
  hard_km: number;
  /** Share of distance run aerobically, 0..1. */
  easy_share: number;
  volume: "below" | "on_target" | "above";
  polarisation: "too_easy" | "on_target" | "too_hard";
  /** One line for the week card, in plain words. */
  note: string;
}

/** What the week's running actually adds up to — volume and distribution. */
export function weeklyRunSummary(
  sessions: { session_type: SessionType; planned_duration_min: number }[],
  zones: PaceZones,
  /** Phase-specific targets; omitted, the build-block window applies. */
  phase?: PhaseType,
): WeeklyRunSummary {
  let total = 0;
  let hard = 0;
  let runs = 0;
  for (const s of sessions) {
    const spec = runSpec(s.session_type);
    if (!spec) continue;
    const km = plannedDistanceKm(s.session_type, s.planned_duration_min, zones);
    if (km <= 0) continue;
    runs += 1;
    total += km;
    hard += km * spec.hard_fraction;
  }

  const totalKm = Math.round(total * 10) / 10;
  const hardKm = Math.round(hard * 10) / 10;
  const easyKm = Math.round((total - hard) * 10) / 10;
  const easyShare = total > 0 ? (total - hard) / total : 0;

  const [kmMin, kmMax] = phase
    ? VOLUME_BY_PHASE[phase]
    : [RUNNING_TARGETS.weekly_km_min, RUNNING_TARGETS.weekly_km_max];
  const [easyMin, easyMax] = phase
    ? POLARISATION_BY_PHASE[phase]
    : [RUNNING_TARGETS.easy_share_min, RUNNING_TARGETS.easy_share_max];

  const volume: WeeklyRunSummary["volume"] =
    totalKm < kmMin ? "below" : totalKm > kmMax ? "above" : "on_target";
  const polarisation: WeeklyRunSummary["polarisation"] =
    easyShare < easyMin ? "too_hard" : easyShare > easyMax ? "too_easy" : "on_target";

  return {
    runs,
    total_km: totalKm,
    easy_km: easyKm,
    hard_km: hardKm,
    easy_share: Math.round(easyShare * 100) / 100,
    volume,
    polarisation,
    note: summaryNote(runs, totalKm, easyShare, volume, polarisation, [kmMin, easyMin, easyMax]),
  };
}

function summaryNote(
  runs: number,
  totalKm: number,
  easyShare: number,
  volume: WeeklyRunSummary["volume"],
  polarisation: WeeklyRunSummary["polarisation"],
  [kmMin, easyMin, easyMax]: [number, number, number],
): string {
  if (!runs) return "No running this week.";
  const pct = Math.round(easyShare * 100);
  const head = `${runs} runs · ${totalKm} km · ${pct}% aerobic`;
  if (volume === "below" && runs < RUNNING_TARGETS.runs_per_week_min) {
    return `${head}. Fewer runs than the ${RUNNING_TARGETS.runs_per_week_min}-4 a Hyrox build wants — add a training day before adding intensity.`;
  }
  if (volume === "below") {
    return `${head}. Under the ${kmMin} km this block wants — the easy volume is what carries the other 50% of your race.`;
  }
  if (volume === "above") {
    return `${head}. Above ${RUNNING_TARGETS.weekly_km_max} km; make sure the extra kilometres are the easy ones.`;
  }
  if (polarisation === "too_hard") {
    return `${head}. The hard share is over 25% — polarised means most of it stays conversational.`;
  }
  if (polarisation === "too_easy") {
    return `${head}. Almost all aerobic; this week has room for one quality session.`;
  }
  return `${head}. Right in this block's polarised window (${Math.round(easyMin * 100)}-${Math.round(
    easyMax * 100,
  )}% aerobic).`;
}
