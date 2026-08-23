// ============================================================================
// Race calendar -> training weeks.
//
// season.ts answers "how does a YEAR with several races hang together". This
// module answers the question one level down: given the 4-20 week plan that is
// running right now, what do the races in the calendar do to its actual days?
//
// The difference between the two is the whole point of race priorities:
//
//   A — the main race. It gets a macrocycle of its own: a taper block before
//       it and a recovery block after it. season.ts does that work; here an A
//       race only contributes the race day itself, at the end of the plan.
//   B — a secondary race. No restructuring: it rides inside the block it falls
//       in, and buys a short taper — the hard sessions in the days before come
//       out — plus two easy days after.
//   C — a tune-up. No taper at all, because the race IS the week's hard
//       session. Only the day before is eased off, and one day after.
//
// Pure and deterministic like the rest of the engine: (start date, races) in,
// day-level adjustments out.
// ============================================================================

import { MAX_HARD_SESSIONS_PER_WEEK, SEASON_TUNING } from "./constants";
import type { DaySlot, SessionType } from "./types";
import type { RacePriority } from "./season";
import type { SessionSlot } from "./micro";

export interface PlanRace {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Free text, e.g. "Hyrox Open Men". */
  type: string;
  priority: RacePriority;
}

export interface RaceDayPlacement {
  race: PlanRace;
  /** 1-based plan week the race falls in. */
  week_number: number;
  /** 1..7, Monday = 1. */
  day_hint: number;
  /** 1-based plan day, so a placement can reach across the week boundary. */
  plan_day: number;
  easy_days_before: number;
  recovery_days_after: number;
  /** Volume multiplier for the week the race sits in. */
  week_volume_multiplier: number;
  /** One sentence for the week goal — why this week looks different. */
  note: string;
}

const DAY_MS = 86_400_000;

function utc(iso: string): Date {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${iso}`);
  return d;
}

/** Monday of the week containing d — plan weeks run Monday to Sunday. */
function mondayOf(d: Date): Date {
  const dow = d.getUTCDay(); // 0 = Sunday
  return new Date(d.getTime() - (dow === 0 ? 6 : dow - 1) * DAY_MS);
}

/** Session types a race day is allowed to replace outright. */
const HARD: SessionType[] = ["run_intervals", "compromised_run", "full_sim", "benchmark"];

export interface PlaceRacesInput {
  /** Any date inside plan week 1 — the plan's Monday is derived from it. */
  startDate: string;
  weeksToRace: number;
  races: PlanRace[];
}

/**
 * Where each race lands in the plan grid, and how much room it needs around it.
 * Races outside the plan window are dropped; two races on one day collapse to
 * the higher priority, because a day can only be raced once.
 */
export function placeRaces(input: PlaceRacesInput): RaceDayPlacement[] {
  const monday = mondayOf(utc(input.startDate));
  const lastDay = input.weeksToRace * 7;
  const byDay = new Map<number, RaceDayPlacement>();

  for (const race of input.races) {
    const planDay = Math.round((utc(race.date).getTime() - monday.getTime()) / DAY_MS) + 1;
    if (planDay < 1 || planDay > lastDay) continue;

    const week = Math.ceil(planDay / 7);
    const day = planDay - (week - 1) * 7;
    const placement: RaceDayPlacement = {
      race,
      week_number: week,
      day_hint: day,
      plan_day: planDay,
      ...shapeFor(race),
    };

    const existing = byDay.get(planDay);
    if (!existing || rank(race.priority) < rank(existing.race.priority)) {
      byDay.set(planDay, placement);
    }
  }

  return [...byDay.values()].sort((a, b) => a.plan_day - b.plan_day);
}

function rank(p: RacePriority): number {
  return p === "A" ? 0 : p === "B" ? 1 : 2;
}

function shapeFor(race: PlanRace): Pick<
  RaceDayPlacement,
  "easy_days_before" | "recovery_days_after" | "week_volume_multiplier" | "note"
> {
  if (race.priority === "A") {
    // The taper block in front of it and the recovery block behind it are the
    // season's job — the volume is already cut. What the week itself still owes
    // the athlete is the last 48 hours: nothing that loads the legs, and no
    // session the day after that pretends the race did not happen.
    return {
      easy_days_before: 2,
      recovery_days_after: 2,
      week_volume_multiplier: 1,
      note: `Race week — ${race.type}. The taper has done the easing; the last two days stay off the legs.`,
    };
  }
  const t = SEASON_TUNING.secondary_race[race.priority];
  return {
    easy_days_before: t.easy_days_before,
    recovery_days_after: t.recovery_days_after,
    week_volume_multiplier: t.week_volume_multiplier,
    note:
      race.priority === "B"
        ? `${race.type} this week — a secondary race. ${t.easy_days_before} easy days in front of it, ${t.recovery_days_after} after, and the block picks up where it left off.`
        : `${race.type} this week — a tune-up. It replaces the week's hard session, so there is no taper: race it, then one easy day.`,
  };
}

/** Volume multiplier a week inherits from a race sitting inside it. */
export function raceVolumeMultiplier(weekNumber: number, placements: RaceDayPlacement[]): number {
  return placements
    .filter((p) => p.week_number === weekNumber)
    .reduce((m, p) => Math.min(m, p.week_volume_multiplier), 1);
}

/** The race notes that belong to a given week, for the weekly goal text. */
export function raceNotesForWeek(weekNumber: number, placements: RaceDayPlacement[]): string[] {
  return placements.filter((p) => p.week_number === weekNumber).map((p) => p.note);
}

// ── Applying a placement to the actual slots of a week ──────────────────────

const RACE_RPE: Record<RacePriority, number> = { A: 10, B: 9, C: 8 };

function raceSlot(placement: RaceDayPlacement, sortOrder: number): SessionSlot {
  return {
    session_type: "race_day",
    day_hint: placement.day_hint,
    day_slot: "am" as DaySlot,
    intensity_rpe_target: RACE_RPE[placement.race.priority],
    planned_duration_min: SEASON_TUNING.race_day_minutes,
    sort_order: sortOrder,
  };
}

/**
 * A session in the run-in loses its edge: runs become easy runs, everything
 * that loads the legs (strength, station work) becomes mobility. Heavy sleds
 * and lunges two days before a race are exactly what a short taper is for.
 */
function soften(slot: SessionSlot): SessionSlot | null {
  if (slot.day_slot === "pm") return null; // a double day in a race run-in: no
  if (slot.session_type === "run_easy" || slot.session_type === "mobility" || slot.session_type === "rest") {
    return slot;
  }
  const stillARun = slot.session_type !== "strength" && slot.session_type !== "station_work";
  return {
    ...slot,
    session_type: stillARun ? "run_easy" : "mobility",
    planned_duration_min: Math.min(slot.planned_duration_min, stillARun ? 40 : 30),
    intensity_rpe_target: Math.min(slot.intensity_rpe_target, 4),
  };
}

/** The days after a race: day 1 is mobility, day 2 may be an easy run. */
function recover(slot: SessionSlot, dayAfter: number): SessionSlot | null {
  if (slot.day_slot === "pm") return null;
  const easyRunAllowed = dayAfter >= 2 && slot.session_type !== "strength" && slot.session_type !== "station_work";
  return {
    ...slot,
    session_type: easyRunAllowed ? "run_easy" : "mobility",
    planned_duration_min: easyRunAllowed ? Math.min(slot.planned_duration_min, 35) : 30,
    intensity_rpe_target: 3,
  };
}

/**
 * Bend one week's slots around every race in the calendar. Works in absolute
 * plan days, so a race on a Saturday correctly eases the Monday of the week
 * after it without the caller having to think about week boundaries.
 */
export function applyRacesToWeek(
  slots: SessionSlot[],
  weekNumber: number,
  placements: RaceDayPlacement[],
): SessionSlot[] {
  if (!placements.length) return slots;

  const out: SessionSlot[] = [];
  for (const slot of slots) {
    const planDay = (weekNumber - 1) * 7 + slot.day_hint;
    let kept: SessionSlot | null = slot;

    for (const p of placements) {
      if (kept === null) break;
      if (planDay === p.plan_day) {
        kept = null; // the race takes the day
        break;
      }
      const before = p.plan_day - planDay;
      if (before > 0 && before <= p.easy_days_before) kept = soften(kept);
      if (kept === null) break;
      const after = planDay - p.plan_day;
      if (after > 0 && after <= p.recovery_days_after) kept = recover(kept, after);
    }
    if (kept) out.push(kept);
  }

  for (const p of placements) {
    if (p.week_number === weekNumber) out.push(raceSlot(p, 0));
  }

  return capHardDays(out, weekNumber, placements)
    .sort((a, b) => a.day_hint - b.day_hint || (a.day_slot === "am" ? 0 : 1) - (b.day_slot === "am" ? 0 : 1))
    .map((s, i) => ({ ...s, sort_order: i }));
}

/**
 * A race counts against the two-hard-days ceiling like any other hard session —
 * a tune-up race on Saturday plus two interval sessions is three hard days. The
 * session that gives way is the one CLOSEST to the race: it is the one whose
 * fatigue actually reaches race day, or lands on legs that just raced.
 */
function capHardDays(
  slots: SessionSlot[],
  weekNumber: number,
  placements: RaceDayPlacement[],
): SessionSlot[] {
  const raceDays = placements.filter((p) => p.week_number === weekNumber).map((p) => p.plan_day);
  if (!raceDays.length) return slots;

  const out = [...slots];
  const isHard = (s: SessionSlot) => HARD.includes(s.session_type) || s.session_type === "race_day";
  const distance = (s: SessionSlot) =>
    Math.min(...raceDays.map((d) => Math.abs((weekNumber - 1) * 7 + s.day_hint - d)));

  while (out.filter(isHard).length > MAX_HARD_SESSIONS_PER_WEEK) {
    const candidates = out
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => isHard(s) && s.session_type !== "race_day")
      .sort((a, b) => distance(a.s) - distance(b.s) || b.s.day_hint - a.s.day_hint);
    const victim = candidates[0];
    if (!victim) break;
    const softened = soften(victim.s);
    if (softened) out[victim.i] = softened;
    else out.splice(victim.i, 1); // a PM half of a double day simply goes
  }
  return out;
}
