import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type {
  Division,
  EquipmentAccess,
  GeneratedSession,
  PhaseType,
  RenderedBlock,
} from "@/lib/engine";
import {
  defaultPaceZones,
  goalCheck,
  weeklyRunSummary,
} from "@/lib/engine";
import type { AthleteProfile, AthleteState } from "@/lib/engine";
import { PlanClient, type ClientSession } from "@/components/PlanClient";
import { withPersonalStrengthDay } from "@/lib/strength/personalDay";
import type { SessionBlockJoinRow } from "@/lib/dbTypes";
import { currentWeekNumber, raceIsBehind, weekStartOf } from "@/lib/planWeek";
import { PlanFinished } from "@/components/PlanFinished";

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
    .select(
      "id, division, experience_level, goal_race_time_sec, equipment_access, station_substitutions, preferred_rest_days, subscription_status, training_days_per_week",
    )
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const { data: plan } = await supabase
    .from("plans")
    .select("id, race_date, starts_on, kind, status, total_weeks, stripe_payment_id")
    .eq("profile_id", profile.id)
    // 'completed' as well: a plan whose race has been and gone is what the
    // athlete should land on the morning after, not the onboarding form.
    .in("status", ["active", "paused", "rehab", "completed"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!plan) {
    // Empty state (#3): explain what belongs here + one clear action.
    return (
      <main className="mx-auto max-w-md space-y-4 pt-20 text-center animate-fade-up">
        <div className="text-4xl">🏁</div>
        <h1 className="text-2xl font-bold">Your plan starts here</h1>
        <p className="text-ash">
          Two minutes of questions, and the engine builds a week-by-week plan backward from your
          race date — week 1 free.
        </p>
        <Link href="/onboarding" className="btn-primary">
          Build my plan →
        </Link>
      </main>
    );
  }

  // The race is behind us: this plan is a record now, and the week view would
  // only show its last taper week for ever. Two ways on — the next race, or a
  // block with no race in it at all.
  const todayIso = new Date().toISOString().slice(0, 10);
  if (raceIsBehind(String(plan.race_date), todayIso) || plan.status === "completed") {
    return (
      <PlanFinished
        raceDate={String(plan.race_date).slice(0, 10)}
        kind={plan.kind === "transition" ? "transition" : "race"}
      />
    );
  }

  // C4: a per-plan purchase OR an active subscription unlocks the plan.
  // PERSONAL_MODE unlocks everything for a self-hosted, single-athlete
  // install — no Stripe account needed to use your own plan.
  const paid =
    process.env.PERSONAL_MODE === "1" ||
    Boolean(plan.stripe_payment_id) ||
    profile.subscription_status === "active";

  const subscriptionAvailable = Boolean(process.env.STRIPE_SUBSCRIPTION_PRICE_ID);

  const [{ data: phases }, { data: weeks }, { data: state }, { data: adjustments }, { data: strengthTemplates }] =
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
      supabase
        .from("strength_templates")
        .select(
          "id, name, sort_order, strength_exercises(id, position, name, sets, rep_min, rep_max, load_kg, superset_group)",
        )
        .eq("profile_id", profile.id)
        .order("sort_order", { ascending: true }),
    ]);

  const weekList = weeks ?? [];
  // Which week is now is derived from the plan's start, not read off a stored
  // flag — the flag was written once and never advanced, so every reader sat
  // on week 1 forever.
  const thisWeek = currentWeekNumber({
    startsOn: String(plan.starts_on).slice(0, 10),
    today: new Date().toISOString().slice(0, 10),
    totalWeeks: plan.total_weeks,
  });
  const current =
    weekList.find((w) => String(w.week_number) === searchParams.week) ??
    weekList.find((w) => w.week_number === thisWeek) ??
    weekList[0];

  // Load sessions + blocks for the selected week. The error is kept: an empty
  // week and a week that failed to load look identical downstream, and since
  // the week now fills its gaps with rest days, a failed load would otherwise
  // render as seven confident "nothing scheduled" tiles.
  const { data: sessionRows, error: sessionsError } = await supabase
    .from("sessions")
    .select(
      "id, day_hint, day_slot, session_type, title, planned_duration_min, intensity_rpe_target, status, sort_order, session_blocks(sort_order, load_adjustments, block_id, workout_blocks(block_type, station, content, slug))",
    )
    .eq("week_id", current.id)
    .order("sort_order", { ascending: true });

  const locked = current.week_number > 1 && !paid;

  // The athlete's own strength day replaces the library's main block. Several
  // days rotate by week, so Tag A / Tag B alternate the way they would in the
  // sheet. Nothing is written: the plan tree stays as generated, this is how
  // the week is *shown* and logged.
  const templates = (strengthTemplates ?? []) as unknown as {
    id: string;
    name: string;
    strength_exercises: {
      id: string;
      position: number;
      name: string;
      sets: number;
      rep_min: number | null;
      rep_max: number | null;
      load_kg: number | string | null;
      superset_group: string | null;
    }[];
  }[];
  const usable = templates.filter((t) => t.strength_exercises?.length);
  const strengthTemplate = usable.length
    ? usable[(current.week_number - 1) % usable.length]
    : null;
  const strengthExercises = (strengthTemplate?.strength_exercises ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((e) => ({
      id: e.id,
      name: e.name,
      sets: e.sets,
      rep_min: e.rep_min,
      rep_max: e.rep_max,
      load_kg: e.load_kg == null ? null : Number(e.load_kg),
      superset_group: e.superset_group,
    }));

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
      day_slot: (s.day_slot ?? "am") as GeneratedSession["day_slot"],
      session_type: s.session_type,
      title: s.title,
      planned_duration_min: s.planned_duration_min,
      intensity_rpe_target: s.intensity_rpe_target,
      sort_order: s.sort_order,
      blocks,
    };
    // A strength session shows the athlete's own exercises instead of the
    // library block — warm-up, finisher and mobility around it stay as
    // generated, and stay around it.
    if (strengthTemplate && s.session_type === "strength" && !locked) {
      session.blocks = withPersonalStrengthDay(blocks, {
        block_id: strengthTemplate.id,
        slug: "personal_strength_day",
        block_type: "main",
        station: null,
        content: strengthExercises.map((e) => ({
          exercise: e.name,
          sets: e.sets,
          rep_min: e.rep_min,
          rep_max: e.rep_max,
          load_kg: e.load_kg,
          superset_group: e.superset_group,
        })),
        load_adjustments: { division: profile.division as Division },
      });
      return {
        id: s.id,
        session,
        status: s.status,
        strength: { templateName: strengthTemplate.name, exercises: strengthExercises },
      };
    }
    return { id: s.id, session, status: s.status };
  });

  // The running architecture of this week: volume and the aerobic/hard split,
  // computed from the live pace zones rather than stored — it follows the
  // athlete's calibration automatically.
  const zones = (state?.pace_zones as ReturnType<typeof defaultPaceZones> | undefined) ?? null;
  const currentPhase = (phases ?? []).find(
    (p: { start_week: number; end_week: number }) =>
      current.week_number >= p.start_week && current.week_number <= p.end_week,
  );
  const runSummary =
    zones && Object.keys(zones).length
      ? weeklyRunSummary(
          (sessionRows ?? []).map((s: { session_type: GeneratedSession["session_type"]; planned_duration_min: number }) => ({
            session_type: s.session_type,
            planned_duration_min: s.planned_duration_min,
          })),
          zones,
          currentPhase?.phase_type as PhaseType | undefined,
        )
      : null;

  // The volume corrective: the target the athlete set, measured against the
  // kilometres they have actually been running.
  // The goal against the estimate. The stored prediction is reused rather than
  // recomputed: it is the same number the estimate card shows, and re-deriving
  // it here would mean reading every benchmark on the app's hottest page.
  const goal = goalCheck({
    profile: profile as unknown as AthleteProfile,
    state: (state ?? {}) as unknown as AthleteState,
    predictedSeconds: state?.predicted_race_time_sec ?? null,
  });

  return (
    <PlanClient
      goalCheck={goal}
      weekStart={weekStartOf(String(plan.starts_on).slice(0, 10), current.week_number)}
      restDays={(profile.preferred_rest_days as number[] | null) ?? []}
      sessionsFailed={Boolean(sessionsError)}
      substitutions={(profile.station_substitutions as Record<string, string>) ?? {}}
      equipment={(profile.equipment_access as EquipmentAccess) ?? "full_gym"}
      planId={plan.id}
      profileId={profile.id}
      paid={paid}
      planStatus={plan.status}
      subscriptionAvailable={subscriptionAvailable}
      raceDate={plan.race_date}
      phases={phases ?? []}
      weeks={weekList}
      currentWeek={current}
      thisWeekNumber={thisWeek}
      planKind={plan.kind === "transition" ? "transition" : "race"}
      sessions={clientSessions}
      state={state}
      adjustments={(adjustments ?? []).map((a: any) => a.reason).filter(Boolean)}
      locked={locked}
      runSummary={runSummary}
    />
  );
}
