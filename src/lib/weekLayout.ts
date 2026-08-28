// ============================================================================
// The training week as seven days, not as a list of sessions.
//
// The engine emits sessions only for the days that carry work, and that is
// right: a plan's session count feeds compliance and load, so inventing rows
// for the days off would inflate both. The day off is therefore derived here,
// where the week is shown rather than stored.
// ============================================================================

export interface DayPlaced {
  session: { day_hint: number; day_slot?: "am" | "pm" | null };
}

export type WeekItem<T extends DayPlaced> =
  | { kind: "session"; cs: T }
  | { kind: "rest"; day: number };

/**
 * Monday to Sunday, with a rest marker wherever nothing is scheduled.
 *
 * Ordered by day rather than by the sessions' own sort_order, which also puts a
 * moved session where it now sits: moving a session rewrites its day and never
 * its sort_order, so a week could otherwise read Mon, Thu, Tue after one move.
 * On a double day the morning session comes first.
 */
/** Morning before evening. Two values, so rank them rather than collate them. */
const slotRank = (slot?: "am" | "pm" | null) => (slot === "pm" ? 1 : 0);

export function weekItemsOf<T extends DayPlaced>(sessions: T[]): WeekItem<T>[] {
  const items: WeekItem<T>[] = [];
  for (let day = 1; day <= 7; day++) {
    const onDay = sessions
      .filter((cs) => cs.session.day_hint === day)
      .sort((a, b) => slotRank(a.session.day_slot) - slotRank(b.session.day_slot));
    if (onDay.length) items.push(...onDay.map((cs) => ({ kind: "session" as const, cs })));
    else items.push({ kind: "rest" as const, day });
  }

  // A day outside 1..7 cannot come from the database (sessions.day_hint is
  // checked) — but this walks seven days and would drop such a session without
  // a word, and losing a training day silently is the one thing a week view
  // must not do. Anything unplaced goes at the end where it can be seen.
  const stray = sessions.filter((cs) => cs.session.day_hint < 1 || cs.session.day_hint > 7);
  return [...items, ...stray.map((cs) => ({ kind: "session" as const, cs }))];
}
