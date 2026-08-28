// ============================================================================
// Building the block between goals, from wherever the decision is made.
//
// Three places need it now: the button on a finished plan, the two routes that
// build a plan for a race too far out to periodise for, and the nightly job
// that notices a plan has drifted into the wrong shape. One builder, so the
// four modules, the runway arithmetic and the "continuing rather than starting"
// rule cannot come apart between them.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLibrary, persistPlan } from "@/lib/persistPlan";
import { loadDayOverrides } from "@/lib/dayOverrides";
import { weekStartOf } from "@/lib/planWeek";
import { generatePlan, transitionWeeksFor, type AthleteProfile, type AthleteState } from "@/lib/engine";
import { loadSeasonRaces, pickMainRace, planWeeksTo } from "@/lib/seasonCalendar";

export interface TransitionBlockResult {
  planId: string;
  weeks: number;
  starts_on: string;
  ends_on: string;
  first_module: "reset" | "offseason";
}

/**
 * Build and persist a transition block starting on `startsOn`.
 *
 * How long it runs is a question about the next race, not a preference: the
 * race block wants its full runway, and everything before that is where the
 * off-season module stretches out.
 */
export async function buildTransitionBlock(opts: {
  /** Reads the calendar and writes the plan — service role where RLS applies. */
  supabase: SupabaseClient;
  profile: AthleteProfile;
  state: AthleteState;
  /** The Monday the block begins on. */
  startsOn: string;
  today: string;
  /** Override the derived length — the manual "start a transition block" path. */
  weeks?: number;
}): Promise<TransitionBlockResult> {
  const { supabase, profile, state, startsOn, today } = opts;

  const calendar = await loadSeasonRaces(supabase, profile.id);
  const nextRace = pickMainRace(calendar, startsOn);
  const weeks =
    opts.weeks ??
    transitionWeeksFor(nextRace ? planWeeksTo(nextRace.date, startsOn, 1) : null);

  // Continuing rather than starting. When the athlete's last plan was itself a
  // transition block, this one picks up at the off-season: the three days of
  // nothing belong after a race, not after twenty weeks of loading.
  const { data: previous } = await supabase
    .from("plans")
    .select("kind")
    .eq("profile_id", profile.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const firstModule = previous?.kind === "transition" ? ("offseason" as const) : ("reset" as const);

  // The block's own last day stands where a race date would: the plan ends when
  // it ends, and nothing is periodised towards it.
  const endsOn = weekStartOf(startsOn, weeks + 1);

  const plan = generatePlan({
    profile,
    state,
    library: await loadLibrary(supabase),
    weeksToRace: weeks,
    mode: "transition",
    firstModule,
    startDate: startsOn,
    dayOverrides: await loadDayOverrides(supabase, profile.id, today),
  });
  const planId = await persistPlan(
    supabase,
    { profileId: profile.id, raceDate: endsOn, startsOn, kind: "transition" },
    plan,
  );

  return { planId, weeks, starts_on: startsOn, ends_on: endsOn, first_module: firstModule };
}
