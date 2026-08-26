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
  MAX_HARD_SESSIONS_PER_WEEK,
  PHASE_VOLUME_MULTIPLIER,
  TRAINING_MIX,
  type TrainingMix,
} from "./constants";
import type { ExperienceLevel } from "./types";

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
  /**
   * Drives the training mix: what a beginner and a sub-60 athlete each need.
   * Defaults to intermediate so a caller that only cares about the week's
   * shape (a preference preview, a test) need not invent a level.
   */
  level?: ExperienceLevel;
  trainingDays: number; // 3..6
  weekInPhase: number; // 1-based
  /** Weeks this phase runs for, so the mix's floor lands on its last week. */
  weeksInPhase?: number;
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
  /** A transition module's own mix, instead of the level's for this phase. */
  mix?: TrainingMix;
  /** Threshold and VO2max work; false keeps the running purely aerobic. */
  intervals?: boolean;
  /** A long run; false keeps every run short. */
  longRun?: boolean;
  /** Ceiling on this week's RPE targets. */
  rpeCap?: number;
}

/**
 * Two hard days a week, no more. A benchmark week, a simulation week or an
 * ambitious run frequency can all push a third onto the calendar; the lowest-
 * priority hard session of the phase gives way to the next session the phase
 * would have used anyway.
 */
export function capHardSessions(
  types: SessionType[],
  phase: PhaseType,
  /** The block's mix, so the freed slot goes where the week is short. */
  mix?: TrainingMix,
): SessionType[] {
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
    // Where the freed slot goes decides whether the week still matches the
    // block. Handing it to the priority list's next spare type is how a race
    // week that had to drop its compromised run ended up 60% running: the
    // list's next spare was an easy run. The mix knows better — it gives the
    // slot to whichever category the week is furthest short of.
    const replacement = mix
      ? mostDeficientType(out, phase, mix)
      : priority.find((t) => !HARD_TYPES.includes(t) && !out.includes(t));
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
  /** Days that must carry the second session, when the athlete trains twice. */
  doubleDays?: number[] | null;
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

/**
 * Pick `count` days out of `pool`, as evenly spread as the pool allows.
 *
 * Both ends of the pool are used and the gaps between are as equal as integers
 * allow: four sessions across seven days is Monday/Wednesday/Friday/Sunday.
 * Stepping by pool.length / count instead lands on Monday/Wednesday/Friday/
 * Saturday — an adjacent pair the week did not need, and with two hard
 * sessions in it that is a rule broken for nothing.
 */
function spreadOver(pool: number[], count: number): number[] {
  if (count <= 0) return [];
  if (count >= pool.length) return [...pool];
  if (count === 1) return [pool[0]];
  const picked = Array.from(
    { length: count },
    (_, i) => pool[Math.round((i * (pool.length - 1)) / (count - 1))],
  );
  const unique = [...new Set(picked)];
  return unique.length === count
    ? unique
    : pool.slice(0, count); // degenerate pools: take the front, deterministically
}

/**
 * Which sessions a day may follow. Three evidence-based rules:
 *
 *   1. No two hard endurance days back to back — between them there is always
 *      a Zone-2 day, a load day, or a gap in the calendar.
 *   2. Strength never lands the day after a hard day: it opens with
 *      plyometrics, and the CNS needs 24-48 h before explosive work.
 *   3. And the other way round — hard endurance never lands the day after
 *      heavy lower-body strength. The interference effect is not directional:
 *      mTOR signalling and AMPK signalling blunt each other whichever comes
 *      first, so a rule that only guards one order guards nothing.
 *
 * `relax` lets the caller bend rules 2 and 3 first (1) and rule 1 last (2)
 * when the day count leaves nothing else — a legal week always comes out.
 */
function allowedAfter(prev: SessionType | null, type: SessionType, relax: number): boolean {
  if (!prev) return true;
  const prevHard = HARD_TYPES.includes(prev);
  if (prevHard && HARD_TYPES.includes(type)) return relax >= 2; // rule 1
  if (prevHard && type === "strength") return relax >= 1; // rule 2
  if (prev === "strength" && HARD_TYPES.includes(type)) return relax >= 1; // rule 3
  return true;
}

/**
 * Assign the week's sessions to its days, or say it cannot be done at this
 * relax level.
 *
 * This searches rather than walking left to right taking whatever fits. A
 * greedy pass only looks at yesterday, so it will happily spend the one
 * session that could have gone last, and then have nothing legal left for the
 * final day — a week with a perfectly good arrangement comes out breaking a
 * rule. With at most nine sessions the search is trivially small, and trying
 * candidates in the phase's own order keeps the result stable.
 */
function assignDays(opts: {
  daySet: number[];
  dayToIndex: Map<number, number>;
  types: SessionType[];
  unplaced: { t: SessionType; i: number }[];
  relax: number;
}): Placement[] | null {
  const result: Placement[] = [];
  const pool = [...opts.unplaced];

  const step = (k: number): boolean => {
    if (k >= opts.daySet.length) return pool.length === 0;
    const day = opts.daySet[k];
    const previous = result[result.length - 1];
    const prev = previous && day - previous.day === 1 ? previous.type : null;

    const pinnedIdx = opts.dayToIndex.get(day);
    if (pinnedIdx != null) {
      result.push({ day, index: pinnedIdx, type: opts.types[pinnedIdx] });
      if (step(k + 1)) return true;
      result.pop();
      return false;
    }

    const tried = new Set<SessionType>();
    for (let n = 0; n < pool.length; n++) {
      const candidate = pool[n];
      // Two sessions of the same type are interchangeable here; trying the
      // second one could only repeat the first one's outcome.
      if (tried.has(candidate.t)) continue;
      tried.add(candidate.t);
      if (!allowedAfter(prev, candidate.t, opts.relax)) continue;
      pool.splice(n, 1);
      result.push({ day, index: candidate.i, type: candidate.t });
      if (step(k + 1)) return true;
      result.pop();
      pool.splice(n, 0, candidate);
    }
    return false;
  };

  return step(0) ? result : null;
}

interface Placement {
  day: number;
  index: number;
  type: SessionType;
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

  // Strictest first: only bend a rule when no arrangement of this week honours
  // it. Relax 2 lets everything through, so a week always comes out — the
  // fallback below exists for the degenerate case where there are more
  // sessions than days.
  let placed: Placement[] | null = null;
  for (let relax = 0; relax <= 2 && !placed; relax++) {
    placed = assignDays({ daySet, dayToIndex, types, unplaced, relax });
  }
  if (!placed) {
    placed = [];
    const pool = [...unplaced];
    for (const day of daySet) {
      const pinnedIdx = dayToIndex.get(day);
      if (pinnedIdx != null) {
        placed.push({ day, index: pinnedIdx, type: types[pinnedIdx] });
        continue;
      }
      const entry = pool.shift();
      if (entry) placed.push({ day, index: entry.i, type: entry.t });
    }
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

// ── Apportioning a week against the training mix ────────────────────────────
// The mix (constants.ts) is a share of planned MINUTES, so the week cannot be
// filled by counting sessions: a 75-minute long run and a 50-minute station
// session are not one unit each.
//
// Sainte-Lague apportionment does the work. At every step the category whose
// minutes are furthest behind its share gets the next session, measured as
// (minutes + half the candidate) / share — the standard divisor rule, which
// avoids both the systematic bias towards large categories that plain
// rounding has and the ties that largest-remainder produces.
//
// The accumulator runs across the weeks of the phase rather than resetting
// every Monday. That is what makes a 5% share real: a category that cannot
// win a slot in any single week still wins one every fourth week, which is
// exactly what "compromised running is 5% of the base block" means.

type MixCategory = keyof TrainingMix;

const CATEGORY_ORDER: MixCategory[] = ["run", "strength", "station", "compromised"];

/**
 * Which share a session spends. Compromised running and the simulation are run
 * sessions to running.ts — they cover ground and count as mileage — but to the
 * mix they are their own category, which is the whole point of the table.
 */
function categoryOf(type: SessionType): MixCategory | null {
  if (type === "compromised_run" || type === "full_sim") return "compromised";
  if (type === "strength") return "strength";
  if (type === "station_work") return "station";
  if (isRunSession(type)) return "run";
  return null;
}

/**
 * The next session type a category would contribute, given what the week
 * already holds. Running has an internal order — the long run carries the
 * aerobic share, then the phase's quality session, then easy volume — while
 * the other three simply repeat.
 */
function nextTypeFor(
  category: MixCategory,
  week: SessionType[],
  phase: PhaseType,
  intervals = true,
  longRun = true,
): SessionType | null {
  switch (category) {
    case "strength":
      return "strength";
    case "station":
      return "station_work";
    case "compromised":
      return "compromised_run";
    case "run": {
      if (longRun && !week.includes("long_run")) return "long_run";
      // The taper keeps its quality session; a deload week gets it too, at the
      // reduced duration every session in that week is already cut to.
      // A re-introduction week has no business at threshold: the capacity to
      // absorb it is exactly what is being rebuilt.
      if (intervals && !week.includes("run_intervals")) return "run_intervals";
      return "run_easy";
    }
  }
}

/**
 * The week's session types, apportioned against the level's mix for this
 * phase. `weekInPhase` replays the phase from its first week so the remainder
 * carries — the same week always comes out the same way.
 */
export function typesForMix(opts: {
  level: ExperienceLevel;
  phase: PhaseType;
  count: number;
  weekInPhase: number;
  /**
   * Weeks the phase runs for. The floor below is applied on its last week;
   * omitted, there is no last week and no floor.
   */
  weeksInPhase?: number;
  /**
   * Overrides the level's mix for this phase. A transition module brings its
   * own — it is not training for the same thing.
   */
  mix?: TrainingMix;
  /** Threshold and VO2max work; false keeps the running purely aerobic. */
  intervals?: boolean;
  /** A long run; false keeps every run short. */
  longRun?: boolean;
}): SessionType[] {
  const mix = opts.mix ?? TRAINING_MIX[opts.level][opts.phase];
  const minutes: Record<MixCategory, number> = { run: 0, strength: 0, station: 0, compromised: 0 };
  let week: SessionType[] = [];

  for (let w = 1; w <= Math.max(1, opts.weekInPhase); w++) {
    week = [];
    for (let i = 0; i < opts.count; i++) {
      let chosen: MixCategory | null = null;
      let bestQuotient = Infinity;
      for (const category of CATEGORY_ORDER) {
        const share = mix[category];
        if (share <= 0) continue;
        const type = nextTypeFor(category, week, opts.phase, opts.intervals, opts.longRun);
        if (!type) continue;
        // Sainte-Lague: the smaller the quotient, the further behind.
        const quotient = (minutes[category] + durationFor(type, false, "am", opts.phase) / 2) / share;
        if (quotient < bestQuotient) {
          bestQuotient = quotient;
          chosen = category;
        }
      }
      if (!chosen) break;
      const type = nextTypeFor(chosen, week, opts.phase, opts.intervals, opts.longRun)!;
      week.push(type);
      minutes[chosen] += durationFor(type, false, "am", opts.phase);
    }
  }

  // The floor: whatever the mix names for this block happens in it at least
  // once. A one-week taper cannot earn a 10% strength share by apportionment —
  // a tenth of five sessions is half a session — but race week without a
  // strength primer is how athletes arrive flat, and the same holds for the
  // 5% of compromised running a beginner's base block asks for. Applied on
  // the phase's last week, so an early week is never forced to overshoot.
  // Only when the caller said how long the phase is: without that there is no
  // "last week" to apply it on, and forcing it every week overshoots.
  if (opts.weeksInPhase != null && opts.weekInPhase >= opts.weeksInPhase) {
    const floored = new Set<number>();
    for (const category of CATEGORY_ORDER) {
      if (mix[category] <= 0 || minutes[category] > 0) continue;
      const type = nextTypeFor(category, week, opts.phase);
      if (!type) continue;

      const slotsPerCategory = week.reduce<Record<string, number>>((acc, t) => {
        const c = categoryOf(t);
        if (c) acc[c] = (acc[c] ?? 0) + 1;
        return acc;
      }, {});

      // The slot comes from whichever category is furthest ahead of its share,
      // and only from one that keeps a slot afterwards — taking the last slot
      // of another category just moves the hole, and the next pass would take
      // it straight back. The long run is never the victim: it carries the
      // week's aerobic base.
      const victim = week
        .map((t, i) => ({ t, i, c: categoryOf(t) }))
        .filter(
          (x) =>
            x.c != null &&
            x.t !== "long_run" &&
            !floored.has(x.i) &&
            (slotsPerCategory[x.c] ?? 0) > 1,
        )
        .sort((a, b) => minutes[b.c!] / mix[b.c!] - minutes[a.c!] / mix[a.c!])[0];

      // Nothing to give: a week with fewer sessions than the mix has
      // categories cannot hold them all, and the smallest share is the one
      // that waits for next week.
      if (!victim) continue;

      minutes[victim.c!] -= durationFor(victim.t, false, "am", opts.phase);
      minutes[category] += durationFor(type, false, "am", opts.phase);
      week[victim.i] = type;
      floored.add(victim.i);
    }
  }
  return week;
}

/** Minutes per category for a week's worth of session types. */
function minutesByCategory(week: SessionType[], phase: PhaseType): Record<MixCategory, number> {
  const minutes: Record<MixCategory, number> = { run: 0, strength: 0, station: 0, compromised: 0 };
  for (const type of week) {
    const category = categoryOf(type);
    if (category) minutes[category] += durationFor(type, false, "am", phase);
  }
  return minutes;
}

/**
 * The non-hard session the week is furthest short of, measured against the
 * mix. Used when a slot has to be given back — a capped hard session, say.
 */
function mostDeficientType(
  week: SessionType[],
  phase: PhaseType,
  mix: TrainingMix,
): SessionType | undefined {
  const minutes = minutesByCategory(week, phase);
  const total = Object.values(minutes).reduce((a, b) => a + b, 0) || 1;
  const candidates = CATEGORY_ORDER.map((category) => ({
    category,
    type: nextTypeFor(category, week, phase),
    deficit: mix[category] - minutes[category] / total,
  }))
    .filter((c) => c.type != null && !HARD_TYPES.includes(c.type!) && mix[c.category] > 0)
    .sort((a, b) => b.deficit - a.deficit);
  return candidates[0]?.type ?? undefined;
}

/**
 * Decide the ordered list of session types for one week, then attach day hints,
 * durations and RPE targets. Deterministic given the inputs.
 */
export function distributeSlots(input: DistributeInput): SessionSlot[] {
  const { phase, trainingDays, weekInPhase, isDeload, isBenchmark } = input;
  const priority = PHASE_SLOT_PRIORITY[phase];

  // What the week trains comes from the level's mix for this phase, not from a
  // fixed prefix of the priority list: the priority list is level-blind, and
  // "the first four of these six" is how a beginner ended up with no station
  // work in the whole base block and no strength in the peak.
  //
  // The priority list still decides order and who gives way — capHardSessions
  // and applyRunFrequency both rank against it.
  // A benchmark, a simulation and a deload all change how many sessions the
  // mix has to work with, so they are settled BEFORE the apportionment rather
  // than by slicing the tail off a full week afterwards. The tail is where the
  // smallest share sits — cutting it is how race week lost its strength
  // primer, which is the one thing a taper must not drop.
  const extras = (isBenchmark ? 1 : 0) + (input.includeFullSim ? 1 : 0);
  const trimmed = isDeload && trainingDays > 3 ? trainingDays - 1 : trainingDays;

  let types = typesForMix({
    level: input.level ?? "intermediate",
    phase,
    count: Math.max(2, trimmed - extras),
    weekInPhase,
    weeksInPhase: input.weeksInPhase,
    mix: input.mix,
    intervals: input.intervals,
    longRun: input.longRun,
  });

  // Benchmark week: the test leads the week.
  if (isBenchmark) types = ["benchmark", ...types];

  // The cycle's single full race simulation, on the one week that carries it.
  if (input.includeFullSim && !types.includes("full_sim")) types = ["full_sim", ...types];

  // The athlete's own running frequency, when they set one.
  types = applyRunFrequency(types, phase, input.runsPerWeek);

  // Two hard days a week is the ceiling, whatever the week is called.
  types = capHardSessions(types, phase, input.mix ?? TRAINING_MIX[input.level ?? "intermediate"][phase]);

  // The athlete's own week shape decides WHEN; the phase decided WHAT.
  const layout = layoutWeek(types, input.prefs);

  const slots: SessionSlot[] = types.map((session_type, i) => ({
    session_type,
    day_hint: layout.days[i] ?? i + 1,
    day_slot: "am" as DaySlot,
    intensity_rpe_target: Math.min(
      input.rpeCap ?? 10,
      rpeFor(session_type, phase, isDeload, "am"),
    ),
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
    // A pinned day comes first, whatever the ranking below would have said:
    // Tuesday evening is a fact and the ranking is a heuristic. What the pin
    // costs is reported by assessWeekPreferences() rather than resolved here.
    const pinned = new Set(clean(input.prefs?.doubleDays));
    const hostOrder = [...slots]
      .filter((s) => s.day_slot !== "pm")
      .sort((a, b) => {
        const pinA = pinned.has(a.day_hint) ? 0 : 1;
        const pinB = pinned.has(b.day_hint) ? 0 : 1;
        if (pinA !== pinB) return pinA - pinB;
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
        intensity_rpe_target: Math.min(input.rpeCap ?? 10, rpeFor(type, phase, isDeload, "pm")),
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
  // Runs carry their own curve across the phases (RUN_SPECS); everything else
  // was phase-blind, which is why a taper used to cut the running and leave
  // strength and station work at full length — a 50% taper on paper and about
  // 20% in the diary. The phase multiplier is what makes the taper a taper for
  // those sessions too, and it is applied exactly once per session type.
  const planned = spec
    ? spec.duration_by_phase[phase]
    : BASE_DURATION[type] * PHASE_VOLUME_MULTIPLIER[phase];
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
    for (const w of assessDoubleDays(slots, prefs)) seen.add(w);
  }
  return [...seen];
}

/**
 * What a pinned double day costs.
 *
 * Not the hard/easy alternation — that cannot be at risk here. The days are
 * laid out before any second session is attached, and the PM pool is light by
 * construction (pmTypeFor returns an easy run or mobility), so a double never
 * turns a day hard and never moves a morning. Three other things can go wrong,
 * and each is worth saying out loud.
 */
function assessDoubleDays(slots: SessionSlot[], prefs: WeekPrefs): string[] {
  const pinned = clean(prefs.doubleDays);
  if (!pinned.length) return [];
  const warnings: string[] = [];
  const mornings = slots.filter((s) => s.day_slot !== "pm").sort((a, b) => a.day_hint - b.day_hint);
  const doubled = new Set(slots.filter((s) => s.day_slot === "pm").map((s) => s.day_hint));

  for (const day of pinned) {
    const host = mornings.find((s) => s.day_hint === day);

    // 1. Nothing to attach to.
    if (!host) {
      warnings.push(
        `${DAY_NAMES[day]} is pinned as a double day but carries no session — a second session needs a first one.`,
      );
      continue;
    }
    // A taper week, a deload week and a benchmark week carry no doubles at
    // all, by design. Complaining that the pin went unused there would be a
    // false alarm about a rule the plan is following on purpose.
    if (!doubled.size) continue;
    if (!doubled.has(day)) {
      warnings.push(
        `${DAY_NAMES[day]} is pinned as a double day, but you train twice on fewer days than you pinned.`,
      );
      continue;
    }

    // 2. The recovery day between two hard days. The rules still hold on
    //    paper; the day just stops being the recovery it was there to be.
    const before = mornings.filter((s) => s.day_hint < day).pop();
    const after = mornings.find((s) => s.day_hint > day);
    const between =
      !HARD_TYPES.includes(host.session_type) &&
      before != null &&
      after != null &&
      HARD_TYPES.includes(before.session_type) &&
      HARD_TYPES.includes(after.session_type);
    if (between) {
      warnings.push(
        `${DAY_NAMES[day]} is your recovery day between ${DAY_NAMES[before!.day_hint]} and ${
          DAY_NAMES[after!.day_hint]
        } — a second session there costs exactly the recovery it is for.`,
      );
    }

    // 3. A hard morning takes mobility as its partner, not an easy run — and
    //    the ergometer offload rides on that easy run.
    if (HARD_TYPES.includes(host.session_type)) {
      warnings.push(
        `${DAY_NAMES[day]} is a hard day, so its second session is mobility rather than an easy run — no ergometer offload on that day.`,
      );
    }
  }
  return warnings;
}

// ── Manual moves, replayed ──────────────────────────────────────────────────

export interface DayOverride {
  /** Monday of the calendar week, ISO date. */
  week_start: string;
  session_type: SessionType;
  day_hint: number;
  day_slot: DaySlot;
}

/**
 * Put the sessions an athlete moved by hand back where they moved them.
 *
 * A generated week is a proposal; a week the athlete rearranged is a decision,
 * and a rebase must not quietly undo a decision. Targets that are already
 * taken swap, exactly as moving in the UI does — so replaying the two rows a
 * swap wrote reproduces the swap, in either order.
 */
export function applyDayOverrides(slots: SessionSlot[], overrides: DayOverride[]): SessionSlot[] {
  if (!overrides.length) return slots;
  const out = [...slots];

  for (const o of overrides) {
    const index = out.findIndex((s) => s.session_type === o.session_type);
    if (index < 0) continue; // the rebuilt week no longer contains that session
    const current = out[index];
    if (current.day_hint === o.day_hint && current.day_slot === o.day_slot) continue;

    const occupant = out.findIndex(
      (s, i) => i !== index && s.day_hint === o.day_hint && s.day_slot === o.day_slot,
    );
    if (occupant >= 0) {
      out[occupant] = {
        ...out[occupant],
        day_hint: current.day_hint,
        day_slot: current.day_slot,
      };
    }
    out[index] = { ...current, day_hint: o.day_hint, day_slot: o.day_slot };
  }

  return out
    .sort((a, b) => (a.day_hint === b.day_hint ? slotRank(a) - slotRank(b) : a.day_hint - b.day_hint))
    .map((slot, i) => ({ ...slot, sort_order: i }));
}
