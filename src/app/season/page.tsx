import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUserId, supabaseServer } from "@/lib/supabase/server";
import { SeasonClient, type SeasonData } from "@/components/SeasonClient";
import { seasonWeekOf } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default async function SeasonPage() {
  const supabase = await supabaseServer();
  const userId = await currentUserId(supabase);
  if (!userId) redirect("/onboarding");

  // Profile, season and plan in one round: the latter two are reached through
  // the profile's owner, so they need not wait for the profile id.
  const [{ data: profile }, { data: season }, { data: plan }] = await Promise.all([
    supabase.from("athlete_profiles").select("id, weaknesses").eq("user_id", userId).single(),
    supabase
      .from("seasons")
      // Races and blocks ride along embedded, rather than as a second round
      // trip once the season id is known; they are put in order below.
      .select(
        "id, start_date, end_date, total_weeks, notes, athlete_profiles!inner(user_id), season_races(sort_order, race_date, race_type, priority, week_number, is_anchor), season_blocks(macrocycle_sort, macrocycle_label, target_race_index, sort_order, kind, start_week, end_week, weeks, start_date, end_date, volume_multiplier, focus, key_sessions, weakness_targets, deload_weeks)",
      )
      .eq("athlete_profiles.user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("plans")
      .select("race_date, athlete_profiles!inner(user_id)")
      .eq("athlete_profiles.user_id", userId)
      .in("status", ["active", "paused", "rehab"])
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!profile) {
    return (
      <main className="mx-auto max-w-md space-y-4 pt-20 text-center animate-fade-up">
        <div className="text-4xl">🗓️</div>
        <h1 className="text-2xl font-bold">First the profile, then the year</h1>
        <p className="text-ash">
          The season is planned around your training days and your weaknesses — two minutes of
          onboarding and it can be built.
        </p>
        <Link href="/onboarding" className="btn-primary">
          Set up my profile →
        </Link>
      </main>
    );
  }

  let data: SeasonData | null = null;
  let currentWeek: number | null = null;

  if (season) {
    const races = ((season.season_races ?? []) as { sort_order: number }[])
      .slice()
      .sort((x, y) => x.sort_order - y.sort_order)
      .map(({ sort_order: _order, ...r }) => r);
    const blocks = ((season.season_blocks ?? []) as { macrocycle_sort: number; sort_order: number }[])
      .slice()
      .sort((x, y) => x.macrocycle_sort - y.macrocycle_sort || x.sort_order - y.sort_order);

    data = {
      start_date: season.start_date,
      end_date: season.end_date,
      total_weeks: season.total_weeks,
      notes: (season.notes as string[]) ?? [],
      races: races as unknown as SeasonData["races"],
      blocks: (blocks as unknown as SeasonData["blocks"]).map((b) => ({
        ...b,
        volume_multiplier: Number(b.volume_multiplier),
      })),
    };

    // "You are here" — same week arithmetic the engine uses.
    const week = seasonWeekOf(season.start_date, new Date().toISOString());
    currentWeek = week >= 1 && week <= season.total_weeks ? week : null;
  }

  return (
    <SeasonClient
      season={data}
      weaknesses={((profile.weaknesses as string[] | null) ?? []) as string[]}
      activePlanRaceDate={plan?.race_date ?? null}
      currentWeek={currentWeek}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
