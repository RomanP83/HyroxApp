// ============================================================================
// Which week of the plan is now.
//
// This used to be a stored flag: persist_plan wrote 'current' on week 1 and
// nothing ever moved it, so every reader stayed on week 1 for the life of the
// plan. A derived answer cannot go stale, and a rebase has nothing to fix up.
//
// The grid is Mondays from plans.starts_on. That is the same grid
// session_day_overrides is keyed on (weekStartOf in dayOverrides.ts), so a
// moved session and the current week can never disagree about which Monday
// they mean.
// ============================================================================

const DAY_MS = 86_400_000;

/** Midnight UTC on the Monday of the week this date falls in. */
export function mondayOf(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  const dow = d.getUTCDay();
  return d.getTime() - (dow === 0 ? 6 : dow - 1) * DAY_MS;
}

/** The Monday a plan week begins on, as an ISO date. */
export function weekStartOf(startsOn: string, weekNumber: number): string {
  return new Date(mondayOf(startsOn) + (weekNumber - 1) * 7 * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * The plan week that contains `today`, clamped into the plan.
 *
 * Before the start it is week 1 — the plan is waiting, not running late. After
 * the last week it is the last week, so a page that has to show something
 * shows the end of the plan rather than nothing.
 */
export function currentWeekNumber(opts: {
  startsOn: string;
  today: string;
  totalWeeks: number;
}): number {
  const elapsed = mondayOf(opts.today) - mondayOf(opts.startsOn);
  const week = Math.floor(elapsed / (7 * DAY_MS)) + 1;
  return Math.max(1, Math.min(opts.totalWeeks, week));
}

/** True while today falls inside the plan's own weeks — no clamping. */
export function planIsRunning(opts: {
  startsOn: string;
  today: string;
  totalWeeks: number;
}): boolean {
  const elapsed = mondayOf(opts.today) - mondayOf(opts.startsOn);
  const week = Math.floor(elapsed / (7 * DAY_MS)) + 1;
  return week >= 1 && week <= opts.totalWeeks;
}

/** The Monday on or after `today` — the natural default for a new plan. */
export function nextMonday(today: string): string {
  const monday = mondayOf(today);
  const isMonday = new Date(`${today.slice(0, 10)}T00:00:00.000Z`).getUTCDay() === 1;
  return new Date(isMonday ? monday : monday + 7 * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Whole plan weeks from a start Monday to a race day, inclusive of the race
 * week. This is the runway a start date leaves — the number that decides
 * whether a moved start needs the plan rebuilt.
 */
export function weeksFromStartToRace(startsOn: string, raceDate: string): number {
  const weeks = Math.round((mondayOf(raceDate) - mondayOf(startsOn)) / (7 * DAY_MS)) + 1;
  return Math.max(0, weeks);
}
