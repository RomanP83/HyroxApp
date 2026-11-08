import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { RunningDashboard, type FitnessRow, type ImportedRun } from "@/components/RunningDashboard";
import { currentUserId, supabaseServer } from "@/lib/supabase/server";
import { dateInTrainingZone } from "@/lib/planClock";

export const dynamic = "force-dynamic";

// Running progress from Garmin: weekly volume, pace, aerobic efficiency,
// VO2max and race predictions. Rows arrive through /api/garmin/import; this
// page only reads and adds up — no plan or engine state is involved.
export default async function RunningPage() {
  const supabase = await supabaseServer();
  const userId = await currentUserId(supabase);
  if (!userId) redirect("/onboarding");
  const { data: profile } = await supabase.from("athlete_profiles").select("id").eq("user_id", userId).single();
  if (!profile) redirect("/onboarding");

  const today = dateInTrainingZone();
  const since = new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10);
  // Migration 0036; without it both queries error and the page shows the empty state.
  const [{ data: runRows }, { data: fitnessRows }] = await Promise.all([
    supabase
      .from("garmin_runs")
      // "*" so a database without migration 0037 (session_id) still opens the page.
      .select("*")
      .eq("profile_id", profile.id)
      .gte("start_local", since)
      .order("start_local", { ascending: true }),
    supabase
      .from("garmin_fitness")
      .select("on_date, vo2max, pred_5k_sec, pred_10k_sec, pred_half_sec, pred_marathon_sec")
      .eq("profile_id", profile.id)
      .gte("on_date", since)
      .order("on_date", { ascending: true }),
  ]);

  return (
    <main className="space-y-6">
      <AppHeader />
      <RunningDashboard
        runs={(runRows ?? []) as ImportedRun[]}
        fitness={(fitnessRows ?? []) as FitnessRow[]}
        today={today}
      />
    </main>
  );
}
