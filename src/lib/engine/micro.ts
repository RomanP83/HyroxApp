// ============================================================================
// Micro layer (Implementation Plan §5, Schritt 2)
// Distribute session slots across the week by training_days_per_week and a
// per-phase priority order. Compromised-running frequency ramps base->peak.
// ============================================================================

import type { DaySlot, PhaseType, SessionType } from "./types";
import { isRunSession, runSpec } from "./running";
import {
  PHASE_SLOT_PRIORITY,
  PHASE_RPE_TARGET,
  COMPROMISED_PER_WEEK,
  MAX_HARD_SESSIONS_PER_WEEK,
} from "./constants";

export interface SessionSlot {
  session_type: SessionType;
  day_hint: number; // 1..7
  day_slot: DaySlot;
  intensity_rpe_target: number; // 1..10
  planned_duration_min: number;
  sort_order: number;
}

// ── Double days (AM / PM) ───────────────────────────────────────────────────
// A second session on a day is only worth it when it does not compete with the
// first one. So: the AM session stays the key session, and the PM session comes
// from a light pool — technique, easy aerobic work, mobility. Two hard sessions
// on one day is the one thing this must never produce.

/** Session types that make a day "hard"; they never get a hard partner. */
const HARD_TYPES: SessionType[] = [
  "compromised_run",
  "run_intervals",
  "full_sim",
  "benchmark",
  "race_day",
];

/**
 * The PM session complements the morning instead of repeating it: never the
 * same system twice in one day. A hard run is followed by mobility, a strength
 * or station morning by easy aerobic work. Nothing here is a key session.
 */
function pmTypeFor(amType: SessionType): SessionType {
  switch (amType) {
    case "strength":
    case "station_work":
      return "run_easy";
    default:
      return "mobility";
  }
}

/** PM sessions are shorter and easier than the same type in the morning. */
const PM_DURATION_FACTOR = 0.7;
const PM_RPE_OFFSET = -1;

// Fallback minutes. Run sessions take theirs from RUN_SPECS per phase — the
// long run is 80 minutes in the base block and 60 by the peak.
const BASE_DURATION: Record<SessionType, number> = {
  long_run: 75,
  run_easy: 45,
  run_intervals: 55,
  compromised_run: 60,
  strength: 60,
  station_work: 50,
  full_sim: 90,
  mobility: 30,
  benchmark: 45,
  race_day: 90,
  rest: 0,
};

const RPE_OFFSET: Record<SessionType, number> = {
  long_run: -1, // Zone 2, but long: a touch above a pure recovery run
  run_easy: -2,
  run_intervals: 1,
  compromised_run: 1,
  strength: 0,
  station_work: 0,
  full_sim: 2,
  mobility: -3,
  benchmark: 2,
  race_day: 3,
  rest: -5,
};

function clampRpe(v: number): number {
  return Math.max(1, Math.min(10, v));
}

/** Evenly spread N sessions across a 7-day week, hard days not back-to-back. */
function spreadDays(count: number): number[] {
  if (count <= 0) return [];
  if (count >= 7) return [1, 2, 3, 4, 5, 6, 7].slice(0, count);
  const days: number[] = [];
  const step = 7 / count;
  for (let i = 0; i < count; i++) {
    days.push(Math.min(7, Math.round(i * step) + 1));
  }
  // de-duplicate while keeping order
  const seen = new Set<number>();
  return days.map((d) => {
    let day = d;
    while (seen.has(day) && day < 7) day++;
    seen.add(day);
    return day;
  });
}

interface DistributeInput {
  phase: PhaseType;
  trainingDays: number; // 3..6
  weekInPhase: number; // 1-based
  isDeload: boolean;
  isBenchmark: boolean;
  /** Days per week that may carry a second, lighter PM session (0..3). */
  doublesPerWeek?: number;
  /** How many of the week's sessions should be runs. Unset = the phase decides. */
  runsPerWeek?: number;
  /** This is the one week of the cycle that carries a full race simulation. */
  includeFullSim?: boolean;
}

/**
 * Two hard days a week, no more. A benchmark week, a simulation week or an
 * ambitious run frequency can all push a third onto the calendar; the lowest-
 * priority hard session of the phase gives way to the next session the phase
 * would have used anyway.
 */
export function capHardSessions(types: SessionType[], phase: PhaseType): SessionType[] {
  const priority = PHASE_SLOT_PRIORITY[phase];
  const out = [...types];
  const hardCount = () => out.filter((t) => HARD_TYPES.includes(t)).length;

  while (hardCount() > MAX_HARD_SESSIONS_PER_WEEK) {
    // Lowest priority first; a type the phase does not list at all goes before
    // the ones it does (that is what a benchmark or a simulation is).
    const rank = (t: SessionType) => {
      const i = priority.indexOf(t);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    const victim = out
      .filter((t) => HARD_TYPES.includes(t) && rank(t) !== Number.MAX_SAFE_INTEGER)
      .sort((a, b) => rank(b) - rank(a))[0];
    if (!victim) break;
    const replacement = priority.find((t) => !HARD_TYPES.includes(t) && !out.includes(t));
    if (!replacement) {
      out.splice(out.lastIndexOf(victim), 1);
      continue;
    }
    out[out.lastIndexOf(victim)] = replacement;
  }
  return out;
}

/**
 * Bend the week's session mix towards a requested number of runs. Exactly one
 * non-run slot is protected — a Hyrox plan without any strength or station work
 * is not a Hyrox plan — but beyond that the athlete's frequency wins, including
 * "4 of my 5 sessions are runs". In a trimmed deload week the request is capped
 * by the sessions that are actually left.
 */
export function applyRunFrequency(
  types: SessionType[],
  phase: PhaseType,
  runsPerWeek?: number,
): SessionType[] {
  if (!runsPerWeek || !types.length) return types;
  const wanted = Math.max(1, Math.min(runsPerWeek, types.length - 1));
  const priority = PHASE_SLOT_PRIORITY[phase];
  const out = [...types];

  const runCount = () => out.filter((t) => isRunSession(t)).length;

  // Too few runs: promote the next run type the phase would have used.
  while (runCount() < wanted) {
    const nextRun = priority.find((t) => isRunSession(t) && !out.includes(t));
    if (!nextRun) break;
    // Replace from the back — the lowest-priority non-run slot goes first.
    const victim = [...out].reverse().find((t) => !isRunSession(t));
    if (!victim) break;
    out[out.lastIndexOf(victim)] = nextRun;
  }

  // Too many runs: give the slot back to the phase's next non-run session.
  // The victim is the phase's LOWEST-priority run — which is the recovery run
  // before the long run, because the long run is what carries the aerobic
  // share of the week.
  while (runCount() > wanted) {
    const victim = [...out]
      .filter((t) => isRunSession(t))
      .sort((a, b) => priority.indexOf(b) - priority.indexOf(a))[0];
    if (!victim) break;
    const replacement =
      priority.find((t) => !isRunSession(t) && !out.includes(t)) ?? "mobility";
    out[out.lastIndexOf(victim)] = replacement;
  }

  return out;
}

/**
 * How many doubles this specific week actually gets. Three weeks say no:
 * a taper cuts volume (PP4), a deload is a deload, and a benchmark week wants
 * you fresh for the test.
 */
export function doublesForWeek(input: {
  phase: PhaseType;
  trainingDays: number;
  doublesPerWeek: number;
  isDeload: boolean;
  isBenchmark: boolean;
}): number {
  const wanted = Math.max(0, Math.min(3, Math.floor(input.doublesPerWeek || 0)));
  if (!wanted) return 0;
  if (input.phase === "taper" || input.isDeload || input.isBenchmark) return 0;
  // At least one training day stays a single — a week of nothing but doubles
  // is a volume jump, not a plan.
  return Math.min(wanted, Math.max(0, input.trainingDays - 1));
}

/**
 * Decide the ordered list of session types for one week, then attach day hints,
 * durations and RPE targets. Deterministic given the inputs.
 */
export function distributeSlots(input: DistributeInput): SessionSlot[] {
  const { phase, trainingDays, weekInPhase, isDeload, isBenchmark } = input;
  const priority = PHASE_SLOT_PRIORITY[phase];

  let types = priority.slice(0, trainingDays);

  // Compromised-running ramp (§5 Schritt 2). In base it is only every 2nd week;
  // when it is an "off" week, fall back to the next non-selected priority slot.
  const perWeek = COMPROMISED_PER_WEEK[phase];
  if (perWeek < 1) {
    // 0 = never in this phase (base); a fraction = every other week.
    const wantThisWeek = perWeek > 0 && weekInPhase % 2 === 0;
    if (!wantThisWeek) {
      const fallback = priority.find((t) => !types.includes(t)) ?? "run_easy";
      types = types.map((t) => (t === "compromised_run" ? fallback : t));
    }
  }

  // Benchmark week: front-load a benchmark session, drop the lowest slot.
  if (isBenchmark) {
    types = ["benchmark", ...types.slice(0, Math.max(2, trainingDays - 1))];
  }

  // The cycle's single full race simulation, on the one week that carries it.
  if (input.includeFullSim && !types.includes("full_sim")) {
    types = ["full_sim", ...types.slice(0, Math.max(2, trainingDays - 1))];
  }

  // Deload: shed the lowest-priority slot (keep at least 3 touches).
  if (isDeload && types.length > 3) {
    types = types.slice(0, types.length - 1);
  }

  // The athlete's own running frequency, when they set one.
  types = applyRunFrequency(types, phase, input.runsPerWeek);

  // Two hard days a week is the ceiling, whatever the week is called.
  types = capHardSessions(types, phase);

  const days = spreadDays(types.length);

  const slots: SessionSlot[] = types.map((session_type, i) => ({
    session_type,
    day_hint: days[i] ?? i + 1,
    day_slot: "am" as DaySlot,
    intensity_rpe_target: rpeFor(session_type, phase, isDeload, "am"),
    planned_duration_min: durationFor(session_type, isDeload, "am", phase),
    sort_order: i,
  }));

  // ── Second sessions ───────────────────────────────────────────────────────
  // They attach to a strength or station morning first: those pair with an easy
  // PM run (pmTypeFor), which is exactly the aerobic volume a Hyrox week is
  // short of. A hard-run morning is the second choice — it pairs with mobility,
  // which is right for the day but adds no kilometres. Never two hard sessions
  // on one day: the PM pool is light by construction.
  const doubles = doublesForWeek({
    phase,
    trainingDays,
    doublesPerWeek: input.doublesPerWeek ?? 0,
    isDeload,
    isBenchmark,
  });
  if (doubles > 0) {
    const hostOrder = [...slots].sort((a, b) => {
      const rankA = hostRank(a.session_type);
      const rankB = hostRank(b.session_type);
      return rankA === rankB ? a.day_hint - b.day_hint : rankA - rankB;
    });
    for (const host of hostOrder.slice(0, doubles)) {
      const type = pmTypeFor(host.session_type);
      slots.push({
        session_type: type,
        day_hint: host.day_hint,
        day_slot: "pm",
        intensity_rpe_target: rpeFor(type, phase, isDeload, "pm"),
        planned_duration_min: durationFor(type, isDeload, "pm", phase),
        sort_order: 0, // assigned below, once the week is in order
      });
    }
  }

  // Chronological order, AM before PM — the plan view reads by sort_order.
  return slots
    .sort((a, b) => (a.day_hint === b.day_hint ? slotRank(a) - slotRank(b) : a.day_hint - b.day_hint))
    .map((slot, i) => ({ ...slot, sort_order: i }));
}

/**
 * Which mornings are worth doubling on. Strength and station days come first:
 * pmTypeFor() pairs them with an easy run, which is exactly the aerobic volume
 * a Hyrox week runs short of. A key-session morning is next — it pairs with
 * mobility, right for the day but worth no kilometres. An easy day is the last
 * place to add anything: it is already the recovery in the week.
 */
function hostRank(type: SessionType): number {
  if (type === "strength" || type === "station_work") return 0;
  if (HARD_TYPES.includes(type)) return 1;
  return 2;
}

function slotRank(slot: SessionSlot): number {
  return slot.day_slot === "am" ? 0 : 1;
}

function rpeFor(
  type: SessionType,
  phase: PhaseType,
  isDeload: boolean,
  slot: DaySlot,
): number {
  let rpe = PHASE_RPE_TARGET[phase] + RPE_OFFSET[type];
  if (isDeload) rpe -= 2;
  if (slot === "pm") rpe += PM_RPE_OFFSET;
  return clampRpe(rpe);
}

function durationFor(
  type: SessionType,
  isDeload: boolean,
  slot: DaySlot,
  phase: PhaseType,
): number {
  const spec = runSpec(type);
  const planned = spec?.duration_by_phase[phase] || BASE_DURATION[type];
  const base = isDeload ? planned * 0.7 : planned;
  return Math.round(slot === "pm" ? base * PM_DURATION_FACTOR : base);
}
