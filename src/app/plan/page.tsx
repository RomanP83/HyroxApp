import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Division, GeneratedSession, PhaseType, RenderedBlock } from "@/lib/engine";
import {
  defaultPaceZones,
  weeklyRunSummary,
} from "@/lib/engine";
import { PlanClient, type ClientSession } from "@/components/PlanClient";
import type { SessionBlockJoinRow } from "@/lib/dbTypes";
import { dateInTrainingZone, syncPlanWeekStatuses } from "@/lib/planClock";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const query = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/onboarding");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id, division, training_days_per_week")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const { data: plan } = await supabase
    .from("plans")
    .select("id, race_date, status, total_weeks, generated_at")
    .eq("profile_id", profile.id)
    .in("status", ["active", "paused", "rehab"])
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
          race date.
        </p>
        <Link href="/onboarding" className="btn-primary">
          Build my plan →
        </Link>
      </main>
    );
  }

  const activeWeekNumber = await syncPlanWeekStatuses(supabase, plan);

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
  const current =
    weekList.find((w) => String(w.week_number) === query.week) ??
    weekList.find((w) => w.week_number === Math.min(activeWeekNumber, plan.total_weeks)) ??
    weekList[0];
  if (!current) throw new Error("Active plan has no weeks");

  // Load sessions + blocks for the selected week.
  const { data: sessionRows } = await supabase
    .from("sessions")
    .select(
      "id, day_hint, day_slot, session_type, title, planned_duration_min, intensity_rpe_target, status, sort_order, session_blocks(sort_order, load_adjustments, block_id, workout_blocks(block_type, station, content, slug))",
    )
    .eq("week_id", current.id)
    .order("sort_order", { ascending: true });

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
    const joinRows = (s.session_blocks ?? []) as SessionBlockJoinRow[];
    const blocks: RenderedBlock[] = joinRows
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
    // library block — warm-up and mobility around it stay as generated.
    if (strengthTemplate && s.session_type === "strength") {
      session.blocks = [
        ...blocks.filter((b) => b.block_type !== "main"),
        {
          block_id: strengthTemplate.id,
          slug: "personal_strength_day",
          block_type: "main",
          station: null,
          sort_order: 1,
          content: strengthExercises.map((e) => ({
            exercise: e.name,
            sets: e.sets,
            rep_min: e.rep_min,
            rep_max: e.rep_max,
            load_kg: e.load_kg,
            superset_group: e.superset_group,
          })),
          load_adjustments: { division: profile.division as Division },
        },
      ];
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
  return (
    <PlanClient
      planId={plan.id}
      profileId={profile.id}
      planStatus={plan.status}
      raceDate={plan.race_date}
      trainingDate={dateInTrainingZone()}
      phases={phases ?? []}
      weeks={weekList}
      currentWeek={current}
      sessions={clientSessions}
      state={state}
      adjustments={(adjustments ?? []).map((a: any) => a.reason).filter(Boolean)}
      runSummary={runSummary}
    />
  );
}
