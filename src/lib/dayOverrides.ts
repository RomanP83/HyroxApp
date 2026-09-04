// ============================================================================
// Manual moves, stored against the calendar week so a rebase can replay them.
//
// Plan week numbering shifts when a plan is rebuilt from today; the Monday a
// week starts on does not. Plan week W of a plan generated on G starts at
// monday(G) + (W-1)*7 — the same grid the race calendar uses.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DayOverride } from "@/lib/engine";
import { dateInTrainingZone } from "@/lib/planClock";

const DAY_MS = 86_400_000;

function mondayOf(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  const dow = d.getUTCDay();
  return d.getTime() - (dow === 0 ? 6 : dow - 1) * DAY_MS;
}

/** The Monday a given plan week starts on. */
export function weekStartOf(planGeneratedAt: string, weekNumber: number): string {
  const generatedDate = planGeneratedAt.length > 10
    ? dateInTrainingZone(new Date(planGeneratedAt)) : planGeneratedAt;
  return new Date(mondayOf(generatedDate) + (weekNumber - 1) * 7 * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Overrides worth replaying: this week and every week ahead of it. Past weeks
 * are history — a rebase never regenerates them, so their rows would only
 * accumulate.
 */
export async function loadDayOverrides(
  supabase: SupabaseClient,
  profileId: string,
  today: string,
): Promise<DayOverride[]> {
  const from = new Date(mondayOf(today)).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("session_day_overrides")
    .select("week_start, session_type, day_hint, day_slot")
    .eq("profile_id", profileId)
    .gte("week_start", from);

  return (data ?? []).map((r) => ({
    week_start: String(r.week_start).slice(0, 10),
    session_type: r.session_type as DayOverride["session_type"],
    day_hint: Number(r.day_hint),
    day_slot: (r.day_slot ?? "am") as DayOverride["day_slot"],
  }));
}

/**
 * Record where the athlete put a session. Upsert on (profile, week, type): the
 * latest move for that session in that week is the one that counts, and a swap
 * simply writes both of its sides.
 */
export async function recordDayOverrides(
  supabase: SupabaseClient,
  profileId: string,
  weekStart: string,
  moves: { session_type: string; day_hint: number; day_slot: string }[],
): Promise<void> {
  if (!moves.length) return;
  await supabase.from("session_day_overrides").upsert(
    moves.map((m) => ({
      profile_id: profileId,
      week_start: weekStart,
      session_type: m.session_type,
      day_hint: m.day_hint,
      day_slot: m.day_slot,
    })),
    { onConflict: "profile_id,week_start,session_type" },
  );

  // Keep the table to the horizon it is useful for.
  const cutoff = new Date(mondayOf(weekStart) - 56 * DAY_MS).toISOString().slice(0, 10);
  await supabase
    .from("session_day_overrides")
    .delete()
    .eq("profile_id", profileId)
    .lt("week_start", cutoff);
}
