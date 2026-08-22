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
  /** Bounds a scaled session must stay inside, whatever the volume target. */
  min_minutes: number;
  max_minutes: number;
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
    min_minutes: 45,
    max_minutes: 150,
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
    min_minutes: 20,
    max_minutes: 60,
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
    min_minutes: 30,
    max_minutes: 75,
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
    min_minutes: 30,
    max_minutes: 90,
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
    min_minutes: 45,
    max_minutes: 120,
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

// ── Volume: one number for the cycle, a curve for the weeks ────────────────

/**
 * Share of the cycle's PEAK weekly volume each phase carries. Volume peaks in
 * the build block and then yields to intensity — the peak phase sharpens, it
 * does not pile on kilometres, and the taper halves everything.
 *
 * The athlete sets the peak, not an average: an average hides the single
 * hardest week, which is the one that decides whether the cycle is survivable.
 */
export const VOLUME_CURVE_BY_PHASE: Record<PhaseType, number> = {
  base: 0.85,
  build: 1,
  peak: 0.9,
  taper: 0.5,
};

/** Weeks spent ramping into the plan's volume before the curve applies fully. */
export const VOLUME_RAMP_WEEKS = 3;
export const VOLUME_RAMP_START = 0.75;
/** A deload week runs at the same reduction the session durations use. */
export const VOLUME_DELOAD_FACTOR = 0.7;

/** The kilometres one specific week is aiming at. */
export function weeklyVolumeTarget(opts: {
  peakKm: number;
  phase: PhaseType;
  isDeload: boolean;
  /** 1-based plan week; the first weeks ramp in rather than starting at full. */
  weekNumber?: number;
}): number {
  const phaseShare = VOLUME_CURVE_BY_PHASE[opts.phase];
  const week = opts.weekNumber ?? VOLUME_RAMP_WEEKS + 1;
  const ramp =
    week <= VOLUME_RAMP_WEEKS
      ? VOLUME_RAMP_START +
        ((1 - VOLUME_RAMP_START) * (week - 1)) / Math.max(1, VOLUME_RAMP_WEEKS - 1)
      : 1;
  const deload = opts.isDeload ? VOLUME_DELOAD_FACTOR : 1;
  return Math.round(opts.peakKm * phaseShare * ramp * deload * 10) / 10;
}

/**
 * Stretch or shrink the week's run sessions so their planned distance adds up
 * to the target, keeping the proportions of the prescription: the long run
 * stays the long one. Non-run sessions are untouched, and every session stays
 * inside its own bounds — a 60 km target does not turn a recovery run into 90
 * minutes.
 */
export function scaleRunDurations<T extends { session_type: SessionType; planned_duration_min: number }>(
  slots: T[],
  zones: PaceZones,
  targetKm: number,
): T[] {
  const baseline = slots.reduce(
    (km, s) => km + plannedDistanceKm(s.session_type, s.planned_duration_min, zones),
    0,
  );
  if (baseline <= 0 || targetKm <= 0) return slots;

  // A single week may move the volume by half, not by a factor of five.
  const factor = Math.max(0.5, Math.min(1.8, targetKm / baseline));
  return slots.map((slot) => {
    const spec = runSpec(slot.session_type);
    if (!spec) return slot;
    const scaled = Math.round((slot.planned_duration_min * factor) / 5) * 5;
    return {
      ...slot,
      planned_duration_min: Math.max(spec.min_minutes, Math.min(spec.max_minutes, scaled)),
    };
  });
}

// ── Is that target reachable from where the athlete actually is? ───────────

export interface VolumeAssessment {
  /** The highest peak the recent weeks support, or null without history. */
  safe_peak_km: number | null;
  recent_weekly_km: number | null;
  verdict: "ok" | "steep" | "unknown";
  note: string;
}

/** Weekly load may grow ~10%; over a build that compounds, but not forever. */
export const VOLUME_WEEKLY_GROWTH = 1.1;
export const VOLUME_MAX_CYCLE_GROWTH = 1.6;

/**
 * Compare the target against what the athlete has actually been running. The
 * plan does not refuse a number — it says what the last four weeks support, so
 * an ambitious peak is a decision rather than an accident.
 */
export function assessVolumeTarget(opts: {
  targetKm: number;
  /** Kilometres actually run per week, most recent first. */
  recentWeeklyKm: number[];
  /** Weeks between now and the peak week of the cycle. */
  weeksToPeak: number;
}): VolumeAssessment {
  const weeks = opts.recentWeeklyKm.filter((km) => km > 0).slice(0, 4);
  if (weeks.length < 2) {
    return {
      safe_peak_km: null,
      recent_weekly_km: weeks.length ? Math.round(weeks[0] * 10) / 10 : null,
      verdict: "unknown",
      note: "Not enough logged running yet to judge the target — log a few weeks and this becomes a real check.",
    };
  }

  const recent = weeks.reduce((sum, km) => sum + km, 0) / weeks.length;
  const compounded = recent * Math.pow(VOLUME_WEEKLY_GROWTH, Math.max(0, opts.weeksToPeak));
  const safePeak = Math.round(Math.min(compounded, recent * VOLUME_MAX_CYCLE_GROWTH) * 10) / 10;
  const recentKm = Math.round(recent * 10) / 10;

  if (opts.targetKm <= safePeak) {
    return {
      safe_peak_km: safePeak,
      recent_weekly_km: recentKm,
      verdict: "ok",
      note: `You have been running ${recentKm} km a week; ${opts.targetKm} km at the peak is a sane build from there.`,
    };
  }
  return {
    safe_peak_km: safePeak,
    recent_weekly_km: recentKm,
    verdict: "steep",
    note: `You have been running ${recentKm} km a week. ${opts.targetKm} km at the peak is a steeper ramp than the last four weeks support — about ${safePeak} km would be the safe end of it.`,
  };
}

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
    return `${head}. Under the ${kmMin} km this block wants — the easy volume is what carries the other 50% of your race. A double day (its PM session is an easy run) is the cheapest way to add it.`;
  }
  if (volume === "above") {
    return `${head}. Above ${RUNNING_TARGETS.weekly_km_max} km; make sure the extra kilometres are the easy ones.`;
  }
  if (polarisation === "too_hard") {
    return `${head}. The hard share is above this block's window — polarised means most of it stays conversational. A double day (its PM session is an easy run) or a sixth training day is what buys those kilometres back.`;
  }
  if (polarisation === "too_easy") {
    return `${head}. Almost all aerobic; this week has room for one quality session.`;
  }
  return `${head}. Right in this block's polarised window (${Math.round(easyMin * 100)}-${Math.round(
    easyMax * 100,
  )}% aerobic).`;
}
