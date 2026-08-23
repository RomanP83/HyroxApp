import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { SeasonClient, type SeasonData } from "@/components/SeasonClient";
import { seasonWeekOf } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default async function SeasonPage() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/onboarding");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id, weaknesses")
    .eq("user_id", user.id)
    .single();
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

  const [{ data: season }, { data: plan }] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, start_date, end_date, total_weeks, notes")
      .eq("profile_id", profile.id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("plans")
      .select("race_date")
      .eq("profile_id", profile.id)
      .in("status", ["active", "paused", "rehab"])
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let data: SeasonData | null = null;
  let currentWeek: number | null = null;

  if (season) {
    const [{ data: races }, { data: blocks }] = await Promise.all([
      supabase
        .from("season_races")
        .select("race_date, race_type, priority, week_number, is_anchor")
        .eq("season_id", season.id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("season_blocks")
        .select(
          "macrocycle_sort, macrocycle_label, target_race_index, sort_order, kind, start_week, end_week, weeks, start_date, end_date, volume_multiplier, focus, key_sessions, weakness_targets, deload_weeks",
        )
        .eq("season_id", season.id)
        .order("macrocycle_sort", { ascending: true })
        .order("sort_order", { ascending: true }),
    ]);

    data = {
      start_date: season.start_date,
      end_date: season.end_date,
      total_weeks: season.total_weeks,
      notes: (season.notes as string[]) ?? [],
      races: (races ?? []) as SeasonData["races"],
      blocks: ((blocks ?? []) as SeasonData["blocks"]).map((b) => ({
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
