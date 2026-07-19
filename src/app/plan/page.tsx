import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { GeneratedSession, RenderedBlock } from "@/lib/engine";
import { PlanClient, type ClientSession } from "@/components/PlanClient";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/onboarding");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id, division")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const { data: plan } = await supabase
    .from("plans")
    .select("id, race_date, status, total_weeks, stripe_payment_id")
    .eq("profile_id", profile.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  if (!plan) {
    return (
      <main className="space-y-4 pt-16 text-center">
        <h1 className="text-2xl font-bold">No plan yet</h1>
        <Link href="/onboarding" className="btn-primary">
          Build my plan →
        </Link>
      </main>
    );
  }

  const paid = !!plan.stripe_payment_id;

  const [{ data: phases }, { data: weeks }, { data: state }, { data: adjustments }] =
    await Promise.all([
      supabase.from("plan_phases").select("phase_type, start_week, end_week").eq("plan_id", plan.id),
      supabase
        .from("plan_weeks")
        .select("id, week_number, is_deload, is_benchmark_week, weekly_goal, status")
        .eq("plan_id", plan.id)
        .order("week_number", { ascending: true }),
      supabase.from("athlete_state").select("*").eq("profile_id", profile.id).single(),
      supabase
        .from("plan_adjustments")
        .select("reason, created_at")
        .eq("plan_id", plan.id)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const weekList = weeks ?? [];
  const current =
    weekList.find((w) => String(w.week_number) === searchParams.week) ??
    weekList.find((w) => w.status === "current") ??
    weekList[0];

  // Load sessions + blocks for the selected week.
  const { data: sessionRows } = await supabase
    .from("sessions")
    .select(
      "id, day_hint, session_type, title, planned_duration_min, intensity_rpe_target, status, sort_order, session_blocks(sort_order, load_adjustments, block_id, workout_blocks(block_type, station, content, slug))",
    )
    .eq("week_id", current.id)
    .order("sort_order", { ascending: true });

  const locked = current.week_number > 1 && !paid;

  const clientSessions: ClientSession[] = (sessionRows ?? []).map((s: any) => {
    // A1/K1: locked weeks never ship their blocks to the browser — the lock
    // must live server-side, not as a UI overlay over fully delivered data.
    const blocks: RenderedBlock[] = locked
      ? []
      : (s.session_blocks ?? [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((sb: any) => ({
            block_id: sb.block_id,
            slug: sb.workout_blocks?.slug,
            block_type: sb.workout_blocks?.block_type,
            station: sb.workout_blocks?.station ?? null,
            content: sb.workout_blocks?.content ?? [],
            sort_order: sb.sort_order,
            load_adjustments: sb.load_adjustments ?? { division: profile.division },
          }));
    const session: GeneratedSession = {
      day_hint: s.day_hint,
      session_type: s.session_type,
      title: s.title,
      planned_duration_min: s.planned_duration_min,
      intensity_rpe_target: s.intensity_rpe_target,
      sort_order: s.sort_order,
      blocks,
    };
    return { id: s.id, session, status: s.status };
  });

  return (
    <PlanClient
      planId={plan.id}
      profileId={profile.id}
      paid={paid}
      raceDate={plan.race_date}
      phases={phases ?? []}
      weeks={weekList}
      currentWeek={current}
      sessions={clientSessions}
      state={state}
      adjustments={(adjustments ?? []).map((a: any) => a.reason).filter(Boolean)}
      locked={locked}
    />
  );
}
