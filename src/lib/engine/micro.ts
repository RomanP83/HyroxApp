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
  /** The athlete's pinned weekdays for long run, strength and rest. */
  prefs?: WeekPrefs;
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

export interface WeekPrefs {
  /** 1 = Monday … 7 = Sunday. */
  longRunDay?: number | null;
  strengthDays?: number[] | null;
  restDays?: number[] | null;
}

export interface WeekLayout {
  /** Calendar day for each entry of `types`, same order. */
  days: number[];
  /** Where a pin collided with a recovery rule, in the athlete's words. */
  warnings: string[];
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function clean(days: number[] | null | undefined): number[] {
  return [...new Set((days ?? []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort(
    (a, b) => a - b,
  );
}

/** Pick `count` days out of `pool`, as evenly spread as the pool allows. */
function spreadOver(pool: number[], count: number): number[] {
  if (count <= 0) return [];
  if (count >= pool.length) return [...pool];
  const step = pool.length / count;
  const picked: number[] = [];
  for (let i = 0; i < count; i++) picked.push(pool[Math.min(pool.length - 1, Math.round(i * step))]);
  return [...new Set(picked)].length === count
    ? [...new Set(picked)]
    : pool.slice(0, count); // degenerate pools: take the front, deterministically
}

/**
 * Which sessions a day may follow. Two evidence-based rules:
 *
 *   1. No two hard endurance days back to back — between them there is always
 *      a Zone-2 day, a load day, or a gap in the calendar.
 *   2. Strength never lands the day after a hard day: it opens with
 *      plyometrics, and the CNS needs 24-48 h before explosive work.
 *
 * `relax` lets the caller bend rule 2 first (1) and rule 1 last (2) when the
 * day count leaves nothing else — a legal week always comes out.
 */
function allowedAfter(prevHard: boolean, type: SessionType, relax: number): boolean {
  if (!prevHard) return true;
  if (HARD_TYPES.includes(type)) return relax >= 2;
  if (type === "strength") return relax >= 1;
  return true;
}

/**
 * Lay the week's sessions onto calendar days.
 *
 * Hard pin, soft warn: a day the athlete pinned is honoured even when it
 * collides with the rules above — gym hours and a free Sunday are facts, and a
 * plan that quietly overrules them is a plan nobody follows. The collision
 * comes back as a warning instead.
 *
 * Everything the athlete did NOT pin is placed around the pins, still obeying
 * both rules wherever the remaining days allow it.
 */
export function layoutWeek(types: SessionType[], prefs: WeekPrefs = {}): WeekLayout {
  const warnings: string[] = [];
  const rest = clean(prefs.restDays);
  let available = [1, 2, 3, 4, 5, 6, 7].filter((d) => !rest.includes(d));

  // The training week wins over the rest days it cannot fit into: an athlete
  // who asks for five sessions and four rest days gets told, not silently
  // given a four-session week.
  if (available.length < types.length) {
    const givenBack = rest.slice(-(types.length - available.length));
    available = [...available, ...givenBack].sort((a, b) => a - b);
    const names = givenBack.map((d) => DAY_NAMES[d]);
    warnings.push(
      `${types.length} sessions do not fit around ${rest.length} rest days — ${names.join(
        " and ",
      )} ${names.length > 1 ? "carry" : "carries"} training this week.`,
    );
  }

  // ── Pins ────────────────────────────────────────────────────────────────
  const pinnedDayOf = new Map<number, number>(); // index in `types` -> day
  const taken = new Set<number>();

  const pin = (index: number, day: number) => {
    pinnedDayOf.set(index, day);
    taken.add(day);
  };

  const longRunIdx = types.indexOf("long_run");
  const longRunDay = prefs.longRunDay ?? null;
  if (longRunIdx >= 0 && longRunDay) {
    if (available.includes(longRunDay)) pin(longRunIdx, longRunDay);
    else
      warnings.push(
        `The long run is pinned to ${DAY_NAMES[longRunDay]}, which is also a rest day — it moved.`,
      );
  }

  const strengthIdxs = types.map((t, i) => (t === "strength" ? i : -1)).filter((i) => i >= 0);
  const strengthDays = clean(prefs.strengthDays).filter(
    (d) => available.includes(d) && !taken.has(d),
  );
  strengthIdxs.forEach((idx, k) => {
    if (strengthDays[k] != null) pin(idx, strengthDays[k]);
  });
  if (strengthIdxs.length > 0 && clean(prefs.strengthDays).length > 0 && !strengthDays.length) {
    warnings.push("Your strength days are all rest days or already taken — strength moved.");
  }

  // ── Days for everything else ────────────────────────────────────────────
  const free = available.filter((d) => !taken.has(d));
  const chosen = spreadOver(free, types.length - pinnedDayOf.size);
  const daySet = [...taken, ...chosen].sort((a, b) => a - b);

  // ── Assign the unpinned sessions around the pinned ones ─────────────────
  const dayToIndex = new Map<number, number>();
  for (const [index, day] of pinnedDayOf) dayToIndex.set(day, index);

  const unplaced = types
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => !pinnedDayOf.has(i));

  const placed: { day: number; index: number; type: SessionType }[] = [];
  for (let k = 0; k < daySet.length; k++) {
    const day = daySet[k];
    const prev = placed[placed.length - 1];
    const prevHard = prev != null && day - prev.day === 1 && HARD_TYPES.includes(prev.type);

    const pinnedIdx = dayToIndex.get(day);
    if (pinnedIdx != null) {
      placed.push({ day, index: pinnedIdx, type: types[pinnedIdx] });
      continue;
    }
    let pick = -1;
    for (let relax = 0; relax <= 2 && pick < 0; relax++) {
      pick = unplaced.findIndex(({ t }) => allowedAfter(prevHard, t, relax));
    }
    const chosenEntry = unplaced.splice(Math.max(0, pick), 1)[0];
    if (chosenEntry) placed.push({ day, index: chosenEntry.i, type: chosenEntry.t });
  }

  // ── Soft warnings: what the pins cost ───────────────────────────────────
  for (let k = 1; k < placed.length; k++) {
    const a = placed[k - 1];
    const b = placed[k];
    if (b.day - a.day !== 1) continue;
    if (HARD_TYPES.includes(a.type) && HARD_TYPES.includes(b.type)) {
      warnings.push(
        `${DAY_NAMES[a.day]} and ${DAY_NAMES[b.day]} are two hard days back to back — your pinned days leave no easy day between them.`,
      );
    } else if (b.type === "strength" && HARD_TYPES.includes(a.type)) {
      warnings.push(
        `Strength on ${DAY_NAMES[b.day]} follows a hard ${DAY_NAMES[a.day]} — plyometrics wants 24-48 h of fresh legs.`,
      );
    }
  }

  const days = new Array<number>(types.length);
  for (const { day, index } of placed) days[index] = day;
  // Any session the day set could not hold (degenerate pools) keeps a sane day.
  for (let i = 0; i < days.length; i++) if (!days[i]) days[i] = daySet[i] ?? i + 1;

  return { days, warnings: [...new Set(warnings)] };
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

  // The athlete's own week shape decides WHEN; the phase decided WHAT.
  const layout = layoutWeek(types, input.prefs);

  const slots: SessionSlot[] = types.map((session_type, i) => ({
    session_type,
    day_hint: layout.days[i] ?? i + 1,
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

/**
 * What a set of pinned weekdays will cost, before the plan is rebuilt.
 *
 * The warning belongs where the decision is made: the athlete picks days in
 * the settings card and finds out there and then that Monday strength plus
 * Tuesday intervals is the interference effect. Runs one representative week
 * per phase — the phases differ in what they contain, so a pin can be free in
 * base and expensive in peak.
 */
export function assessWeekPreferences(
  prefs: WeekPrefs,
  opts: { trainingDays: number; runsPerWeek?: number | null; doublesPerWeek?: number },
): string[] {
  const phases: PhaseType[] = ["base", "build", "peak", "taper"];
  const seen = new Set<string>();
  for (const phase of phases) {
    const slots = distributeSlots({
      phase,
      trainingDays: opts.trainingDays,
      weekInPhase: 2,
      isDeload: false,
      isBenchmark: false,
      doublesPerWeek: opts.doublesPerWeek ?? 0,
      runsPerWeek: opts.runsPerWeek ?? undefined,
      prefs,
    });
    const types = slots.filter((s) => s.day_slot !== "pm").map((s) => s.session_type);
    for (const w of layoutWeek(types, prefs).warnings) seen.add(w);
  }
  return [...seen];
}
