import { redirect } from "next/navigation";
import { currentUserId, supabaseServer } from "@/lib/supabase/server";
import { BenchmarksClient, type BenchmarkDef, type BenchmarkEntry } from "@/components/BenchmarksClient";
import type { RaceResult } from "@/lib/engine";

export const dynamic = "force-dynamic";

// B2: the benchmark protocol UI (start / mid / pre-race testing, plan §2).
export default async function BenchmarksPage() {
  const supabase = await supabaseServer();
  const userId = await currentUserId(supabase);
  if (!userId) redirect("/onboarding");

  // One round: everything keyed by profile is reached through its owner.
  const [{ data: profile }, { data: defs }, { data: results }, { data: state }, { data: raceRows }] =
    await Promise.all([
      supabase
        .from("athlete_profiles")
        // "*" rather than naming hr_max: a database that has not run migration
        // 0028 yet must still open this page — just without AT-PT targets.
        .select("*")
        .eq("user_id", userId)
        .single(),
      supabase.from("benchmark_definitions").select("id, slug, name, metric_type, protocol").order("name"),
      supabase
        .from("benchmark_results")
        .select("benchmark_id, value, phase_context, recorded_at, athlete_profiles!inner(user_id)")
        .eq("athlete_profiles.user_id", userId)
        .order("recorded_at", { ascending: false }),
      supabase
        .from("athlete_state")
        .select("predicted_race_time_sec, athlete_profiles!inner(user_id)")
        .eq("athlete_profiles.user_id", userId)
        .maybeSingle(),
      // A database without migration 0029 answers with an error: no card then.
      supabase
        .from("athlete_race_results")
        .select("id, kind, held_on, label, is_baseline, total_sec, runs_sec, stations_sec, roxzone_sec, athlete_profiles!inner(user_id)")
        .eq("athlete_profiles.user_id", userId)
        .order("held_on", { ascending: false }),
    ]);
  if (!profile) redirect("/onboarding");

  const entries: BenchmarkEntry[] = (results ?? []).map((r) => ({
    benchmark_id: r.benchmark_id,
    value: Number(r.value),
    phase_context: r.phase_context,
    recorded_at: r.recorded_at,
  }));

  return (
    <BenchmarksClient
      defs={(defs ?? []) as BenchmarkDef[]}
      entries={entries}
      predicted={state?.predicted_race_time_sec ?? null}
      hrMax={typeof profile.hr_max === "number" ? profile.hr_max : null}
      races={
        raceRows
          ? (raceRows.map(({ athlete_profiles: _owner, ...r }) => r) as unknown as RaceResult[])
          : undefined
      }
      targetTimeSec={typeof profile.target_time_sec === "number" ? profile.target_time_sec : null}
    />
  );
}
