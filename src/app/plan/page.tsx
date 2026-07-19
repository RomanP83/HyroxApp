import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Division, GeneratedSession, RenderedBlock } from "@/lib/engine";
import { PlanClient, type ClientSession } from "@/components/PlanClient";
import { signDeepLink } from "@/lib/telegram";
import { stravaConfigured } from "@/lib/strava";
import { garminConfigured } from "@/lib/garmin";
import type { SessionBlockJoinRow } from "@/lib/dbTypes";

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
    .select("id, division, telegram_chat_id, strava_athlete_id, garmin_user_id, subscription_status")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  // B1: HMAC deep link for the bot; only offered while not yet connected.
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  const telegramLink =
    botUsername && !profile.telegram_chat_id
      ? `https://t.me/${botUsername}?start=${signDeepLink(profile.id)}`
      : null;

  const { data: plan } = await supabase
    .from("plans")
    .select("id, race_date, status, total_weeks, stripe_payment_id")
    .eq("profile_id", profile.id)
    .in("status", ["active", "paused", "rehab"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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

  // C4: a per-plan purchase OR an active subscription unlocks the plan.
  const paid = Boolean(plan.stripe_payment_id) || profile.subscription_status === "active";

  // C2: Strava connect entry point (hidden once connected / when unconfigured).
  const stravaConnectUrl =
    stravaConfigured() && !profile.strava_athlete_id ? "/api/strava/connect" : null;
  const garminConnectUrl =
    garminConfigured() && !profile.garmin_user_id ? "/api/garmin/connect" : null;
  const subscriptionAvailable = Boolean(process.env.STRIPE_SUBSCRIPTION_PRICE_ID);

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
    const joinRows = (s.session_blocks ?? []) as SessionBlockJoinRow[];
    const blocks: RenderedBlock[] = locked
      ? []
      : joinRows
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((sb) => ({
            block_id: sb.block_id,
            slug: sb.workout_blocks?.slug ?? undefined,
            block_type: (sb.workout_blocks?.block_type ?? "main") as RenderedBlock["block_type"],
            station: (sb.workout_blocks?.station ?? null) as RenderedBlock["station"],
            content: sb.workout_blocks?.content ?? [],
            sort_order: sb.sort_order,
            load_adjustments: (sb.load_adjustments ?? {
              division: profile.division as Division,
            }) as RenderedBlock["load_adjustments"],
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
      planStatus={plan.status}
      telegramLink={telegramLink}
      stravaConnectUrl={stravaConnectUrl}
      garminConnectUrl={garminConnectUrl}
      subscriptionAvailable={subscriptionAvailable}
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
