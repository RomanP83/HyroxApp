// ============================================================================
// Vacation — days the athlete is away, entered ahead of time.
//
// Two modes:
//   maintain — the engine keeps running without the gym: easy runs (with the
//              long run, at most three), one optional quality run held below a
//              full hard effort, bodyweight instead of strength. Stations,
//              sled, game days, simulations and benchmarks turn into easy runs
//              or drop out.
//   off      — nothing is planned on those days.
//
// The race date stays fixed: a vacation uses up plan time, it does not push
// the race. Around it, generate.ts moves the cycle's simulation and the
// benchmark weeks out of the vacation, and makes the week the athlete comes
// back in a lighter re-entry week (VACATION.reentry_min_days or longer away).
// Pure and deterministic like the rest of the engine.
// ============================================================================

import { VACATION } from "./constants";
import type { SessionSlot } from "./micro";
import type { SessionType } from "./types";

export type VacationMode = "maintain" | "off";

export interface Vacation {
  /** First day away, YYYY-MM-DD. */
  start: string;
  /** Last day away, inclusive. */
  end: string;
  mode: VacationMode;
}

export const VACATION_TITLE_PREFIX = "Vacation · ";

const DAY_MS = 86_400_000;
const t = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Clean, ordered vacations; a malformed or reversed one is ignored. */
export function normaliseVacations(vacations: Vacation[] | undefined | null): Vacation[] {
  return (vacations ?? [])
    .filter((v) => /^\d{4}-\d{2}-\d{2}/.test(v.start) && /^\d{4}-\d{2}-\d{2}/.test(v.end) && t(v.end) >= t(v.start))
    .map((v): Vacation => ({ start: v.start.slice(0, 10), end: v.end.slice(0, 10), mode: v.mode === "off" ? "off" : "maintain" }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * Which days of the week starting on `monday` are vacation days, and in which
 * mode. Where two vacations overlap, "off" wins.
 */
export function vacationDaysOfWeek(monday: string, vacations: Vacation[]): Map<number, VacationMode> {
  const out = new Map<number, VacationMode>();
  const m = t(monday);
  for (let d = 1; d <= 7; d++) {
    const day = m + (d - 1) * DAY_MS;
    for (const v of vacations) {
      if (day >= t(v.start) && day <= t(v.end)) {
        if (v.mode === "off" || !out.has(d)) out.set(d, v.mode);
      }
    }
  }
  return out;
}

/**
 * True when the week starting on `monday` is the one the athlete comes back
 * in: it holds the first day after a vacation of at least
 * VACATION.reentry_min_days, and that day is not itself a vacation day.
 */
export function isReentryWeek(monday: string, vacations: Vacation[]): boolean {
  const m = t(monday);
  return vacations.some((v) => {
    const days = Math.round((t(v.end) - t(v.start)) / DAY_MS) + 1;
    if (days < VACATION.reentry_min_days) return false;
    const back = t(v.end) + DAY_MS;
    const inWeek = back >= m && back < m + 7 * DAY_MS;
    const stillAway = vacations.some((o) => back >= t(o.start) && back <= t(o.end));
    return inWeek && !stillAway;
  });
}

/** The vacations touching the week starting on `monday`, for the weekly note. */
export function vacationsInWeek(monday: string, vacations: Vacation[]): Vacation[] {
  const m = t(monday);
  return vacations.filter((v) => t(v.end) >= m && t(v.start) < m + 7 * DAY_MS);
}

/** Turn a session on a "maintain" day into its travel version. */
function maintainType(type: SessionType): SessionType | null {
  switch (type) {
    case "run_easy":
    case "long_run":
    case "run_intervals":
    case "mobility":
    case "race_day":
      return type;
    case "strength":
      return "mobility"; // bodyweight & mobility
    case "compromised_run":
    case "full_sim":
    case "benchmark":
    case "station_work":
      return "run_easy";
    default:
      return null;
  }
}

/**
 * Bend one week's slots around its vacation days. Days outside the vacation
 * are untouched. A race day stays whatever the vacation says — a race in the
 * calendar is a fact.
 */
export function applyVacationToWeek(slots: SessionSlot[], days: Map<number, VacationMode>): SessionSlot[] {
  if (!days.size) return slots;
  const ordered = [...slots].sort(
    (a, b) => a.day_hint - b.day_hint || (a.day_slot === "am" ? 0 : 1) - (b.day_slot === "am" ? 0 : 1),
  );
  const out: SessionSlot[] = [];
  let quality = 0;
  let runs = 0;

  for (const slot of ordered) {
    const mode = days.get(slot.day_hint);
    if (!mode || slot.session_type === "race_day") {
      out.push(slot);
      continue;
    }
    if (mode === "off" || slot.day_slot === "pm") continue; // away, or no second session on holiday

    let type = maintainType(slot.session_type);
    if (!type) continue;
    if (type === "run_intervals" && quality >= VACATION.max_quality) type = "run_easy";
    if ((type === "run_easy" || type === "long_run") && runs >= VACATION.max_runs) continue;

    const next: SessionSlot = { ...slot, session_type: type, vacation: "maintain" };
    if (type === "run_intervals") {
      quality++;
      next.intensity_rpe_target = Math.min(slot.intensity_rpe_target, VACATION.quality_rpe_max);
    } else if (type === "long_run") {
      runs++;
      next.intensity_rpe_target = Math.min(slot.intensity_rpe_target, VACATION.long_run_rpe_max);
      next.planned_duration_min = Math.min(slot.planned_duration_min, VACATION.long_run_max_min);
    } else if (type === "run_easy") {
      runs++;
      next.intensity_rpe_target = Math.min(slot.intensity_rpe_target, VACATION.easy_rpe_max);
      // A station or game day turned into a run keeps a sensible length.
      if (slot.session_type !== "run_easy") next.planned_duration_min = Math.min(slot.planned_duration_min, 45);
    } else if (type === "mobility" && slot.session_type === "strength") {
      next.intensity_rpe_target = Math.min(slot.intensity_rpe_target, VACATION.easy_rpe_max);
      next.planned_duration_min = VACATION.bodyweight_min;
    }
    out.push(next);
  }
  return out.map((s, i) => ({ ...s, sort_order: i }));
}

/** The weekly note for a week with vacation days in it. */
export function vacationNote(inWeek: Vacation[]): string | null {
  if (!inWeek.length) return null;
  const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
  const span = inWeek.map((v) => `${fmt(v.start)}–${fmt(v.end)}`).join(", ");
  return inWeek.every((v) => v.mode === "off")
    ? `Vacation ${span}: nothing planned on those days. Enjoy it — the plan picks up when you are back.`
    : `Vacation ${span}: keep the engine running without the gym — two or three easy runs, one optional quality run, bodyweight. No stations, no sled, no game days.`;
}

/**
 * What a vacation's quality run and bodyweight day contain. Rendered straight
 * into a block (fill.ts), like the compromised sessions — no gym needed.
 */
export const VACATION_BLOCKS = {
  run_intervals: {
    slug: "vac_quality_optional",
    name: "Optional Quality Run",
    why: "Keeps the threshold alive on holiday — only if you feel like it.",
    content: [
      { exercise: "Only if you feel like it — otherwise an easy run" },
      { exercise: "Warm-up jog, 15 min" },
      { exercise: "8 min at about threshold pace, 2 min jog between", sets: 3, rest_sec: 120 },
      { exercise: "Easy cool-down jog" },
    ],
  },
  mobility: {
    slug: "vac_bodyweight",
    name: "Bodyweight & Mobility",
    why: "No gym, no problem: enough to keep the patterns, nothing that needs recovering from.",
    content: [
      { exercise: "Optional — 3 rounds, easy pace" },
      { exercise: "Air squats", reps: 20 },
      { exercise: "Reverse lunges, each leg", reps: 10 },
      { exercise: "Push-ups", reps: 12 },
      { exercise: "Glute bridges", reps: 15 },
      { exercise: "Plank, 45 s" },
      { exercise: "Then 10 min mobility: hips, calves, thoracic spine" },
    ],
  },
} as const;

export const REENTRY_NOTE =
  "Back from vacation: a lighter week to find the rhythm again before the plan continues at full load.";

/** Plan weeks (1-based) with at least one vacation day. */
export function weeksWithVacation(
  weekMonday: (w: number) => string | null,
  totalWeeks: number,
  vacations: Vacation[],
): Set<number> {
  const out = new Set<number>();
  for (let w = 1; w <= totalWeeks; w++) {
    const m = weekMonday(w);
    if (m && vacationDaysOfWeek(m, vacations).size) out.add(w);
  }
  return out;
}

export { iso as isoDay };

/**
 * Vacation days in the half-open span (from, to] — what the inactivity rule
 * must not count as "days without a session".
 */
export function vacationDaysBetween(fromMs: number, toMs: number, vacations: Vacation[]): number {
  const DAY = 86_400_000;
  let n = 0;
  const start = Math.floor(fromMs / DAY) + 1;
  const end = Math.floor(toMs / DAY);
  for (let d = start; d <= end; d++) {
    const ms = d * DAY;
    if (vacations.some((v) => ms >= t(v.start) && ms <= t(v.end))) n++;
  }
  return n;
}
