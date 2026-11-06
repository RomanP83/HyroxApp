import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import {
  defaultPaceZones,
  type Division,
  type ExperienceLevel,
  type PaceZones,
  type Station,
  STATIONS,
} from "@/lib/engine";
import { RaceClient, type LoggedResult } from "@/components/RaceClient";

export const dynamic = "force-dynamic";

export default async function RacePage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/onboarding");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id, division, experience_level, target_time_sec, five_k_seconds")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const [{ data: state }, { data: plan }, { data: results }] = await Promise.all([
    supabase.from("athlete_state").select("station_tiers, measured_station_seconds, pace_zones, predicted_race_time_sec").eq("profile_id", profile.id).maybeSingle(),
    supabase
      .from("plans")
      .select("race_date, kind, total_weeks")
      .eq("profile_id", profile.id)
      .in("status", ["active", "paused", "rehab"])
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Real races from the one race table (athlete_race_results, 0029).
    supabase
      .from("athlete_race_results")
      .select("id, held_on, label, total_sec, runs_sec, stations_sec, roxzone_sec")
      .eq("profile_id", profile.id)
      .eq("kind", "race")
      .order("held_on", { ascending: false })
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
      goalSeconds={profile.target_time_sec ?? null}
      predictedSeconds={state?.predicted_race_time_sec ?? null}
      measured={(state?.measured_station_seconds as Partial<Record<Station, number>>) ?? undefined}
      nextRaceDate={plan && plan.kind !== "transition" ? String(plan.race_date).slice(0, 10) : null}
      results={(results ?? []).map(
        (r: {
          id: string;
          held_on: string;
          label: string | null;
          total_sec: number;
          runs_sec: (number | null)[] | null;
          stations_sec: (number | null)[] | null;
          roxzone_sec: number | null;
        }): LoggedResult => ({
          id: r.id,
          race_date: String(r.held_on).slice(0, 10),
          division: (profile.division as Division) ?? "open",
          name: r.label,
          total_seconds: r.total_sec,
          run_splits: (r.runs_sec ?? []).filter((x): x is number => typeof x === "number"),
          station_times: Object.fromEntries(
            STATIONS.map((st, i) => [st, r.stations_sec?.[i]]).filter(([, v]) => typeof v === "number"),
          ) as Record<string, number>,
          roxzone_seconds: r.roxzone_sec,
        }),
      )}
    />
  );
}
