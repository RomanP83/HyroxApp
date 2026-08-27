import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { defaultPaceZones, type Division, type ExperienceLevel, type PaceZones } from "@/lib/engine";
import { RaceClient, type LoggedResult } from "@/components/RaceClient";

export const dynamic = "force-dynamic";

export default async function RacePage() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/onboarding");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id, division, experience_level, five_k_seconds")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const [{ data: state }, { data: plan }, { data: results }] = await Promise.all([
    supabase.from("athlete_state").select("station_tiers, pace_zones, predicted_race_time_sec").eq("profile_id", profile.id).maybeSingle(),
    supabase
      .from("plans")
      .select("race_date, kind, total_weeks")
      .eq("profile_id", profile.id)
      .in("status", ["active", "paused", "rehab"])
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("race_results")
      .select("id, race_date, division, name, total_seconds, run_splits, station_times, roxzone_seconds")
      .eq("profile_id", profile.id)
      .order("race_date", { ascending: false })
      .limit(10),
  ]);

  const zones =
    (state?.pace_zones as PaceZones | undefined) ?? defaultPaceZones(profile.five_k_seconds ?? 1500);

  return (
    <RaceClient
      division={(profile.division as Division) ?? "open"}
      level={(profile.experience_level as ExperienceLevel) ?? "intermediate"}
      tiers={(state?.station_tiers as Record<string, number>) ?? {}}
      paceZones={zones}
      predictedSeconds={state?.predicted_race_time_sec ?? null}
      nextRaceDate={plan && plan.kind !== "transition" ? String(plan.race_date).slice(0, 10) : null}
      results={(results ?? []) as unknown as LoggedResult[]}
    />
  );
}
