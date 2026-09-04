import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { BenchmarksClient, type BenchmarkDef, type BenchmarkEntry } from "@/components/BenchmarksClient";

export const dynamic = "force-dynamic";

// B2: the benchmark protocol UI (start / mid / pre-race testing, plan §2).
export default async function BenchmarksPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/onboarding");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const [{ data: defs }, { data: results }, { data: state }] = await Promise.all([
    supabase.from("benchmark_definitions").select("id, slug, name, metric_type, protocol").order("name"),
    supabase
      .from("benchmark_results")
      .select("benchmark_id, value, phase_context, recorded_at")
      .eq("profile_id", profile.id)
      .order("recorded_at", { ascending: false }),
    supabase
      .from("athlete_state")
      .select("predicted_race_time_sec")
      .eq("profile_id", profile.id)
      .maybeSingle(),
  ]);

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
    />
  );
}
