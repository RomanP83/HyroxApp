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
export function weekItemsOf<T extends DayPlaced>(sessions: T[]): WeekItem<T>[] {
  const items: WeekItem<T>[] = [];
  for (let day = 1; day <= 7; day++) {
    const onDay = sessions
      .filter((cs) => cs.session.day_hint === day)
      .sort((a, b) =>
        (a.session.day_slot ?? "am").localeCompare(b.session.day_slot ?? "am"),
      );
    if (onDay.length) items.push(...onDay.map((cs) => ({ kind: "session" as const, cs })));
    else items.push({ kind: "rest" as const, day });
  }
  return items;
}
