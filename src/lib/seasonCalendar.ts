// ============================================================================
// The bridge between the stored season calendar and plan generation.
//
// The season page writes the athlete's races into season_races. The plan
// generator wants them as engine input: the main race it is built towards, and
// everything else that falls inside the cycle. One place, so the onboarding
// route and the "build the plan from my calendar" route cannot drift.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanRace } from "@/lib/engine";

export interface CalendarRace extends PlanRace {
  is_anchor: boolean;
}

/** Every race of the athlete's season, ascending by date. */
export async function loadSeasonRaces(
  supabase: SupabaseClient,
  profileId: string,
): Promise<CalendarRace[]> {
  const { data: season } = await supabase
    .from("seasons")
    .select("id")
    .eq("profile_id", profileId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!season) return [];

  const { data } = await supabase
    .from("season_races")
    .select("race_date, race_type, priority, is_anchor")
    .eq("season_id", season.id)
    .order("race_date", { ascending: true });

  return (data ?? []).map((r) => ({
    date: r.race_date as string,
    type: r.race_type as string,
    priority: r.priority as PlanRace["priority"],
    is_anchor: Boolean(r.is_anchor),
  }));
}

/**
 * The main race the plan should be built towards: the next race that anchors a
 * macrocycle. Falls back to the next A race, then to the next race at all —
 * an athlete who entered one B race still wants a plan for it.
 */
export function pickMainRace(races: CalendarRace[], today: string): CalendarRace | null {
  const ahead = races.filter((r) => r.date >= today);
  return (
    ahead.find((r) => r.is_anchor) ?? ahead.find((r) => r.priority === "A") ?? ahead[0] ?? null
  );
}

/**
 * The races the generated plan has to bend its days around: the main race
 * itself (so the plan ends on a race day) plus every race between now and it.
 */
export function racesForPlan(races: CalendarRace[], today: string, mainDate: string): PlanRace[] {
  return races
    .filter((r) => r.date >= today && r.date <= mainDate)
    .map(({ date, type, priority }) => ({ date, type, priority }));
}

const DAY_MS = 86_400_000;

function mondayOf(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  const dow = d.getUTCDay();
  return d.getTime() - (dow === 0 ? 6 : dow - 1) * DAY_MS;
}

/**
 * How many plan weeks there are up to and including the race week.
 *
 * Counted on the Monday grid the plan itself uses, not on raw days: that is
 * what guarantees the race actually lands in the LAST week of the plan, so a
 * race day can be written into it. Clamped to the 4-20 weeks a cycle covers.
 */
export function planWeeksTo(raceDate: string, today: string, minWeeks = 4): number {
  const weeks = Math.round((mondayOf(raceDate) - mondayOf(today)) / (7 * DAY_MS)) + 1;
  return Math.max(minWeeks, Math.min(20, weeks));
}
