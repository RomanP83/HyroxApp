// ============================================================================
// Build the detailed training plan from the athlete's race calendar.
//
// The season page owns the calendar; this route turns it into the 4-20 week
// plan: the next main race is the target, every race between now and it rides
// inside the plan and bends the days around it. Nothing here decides anything
// — planWeeksTo() and the engine do, so the same calendar always produces the
// same plan.
// ============================================================================
import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { loadLibrary, persistPlan } from "@/lib/persistPlan";
import { loadDayOverrides } from "@/lib/dayOverrides";
import { loadSeasonRaces, pickMainRace, planWeeksTo, racesForPlan } from "@/lib/seasonCalendar";
import { buildTransitionBlock } from "@/lib/transitionBlock";
import { buildRaceBlock } from "@/lib/raceBlock";
import { weekStartOf } from "@/lib/planWeek";
import { generatePlan, raceBlockFits, type AthleteProfile } from "@/lib/engine";
import { stateFromRow, type AthleteStateRow } from "@/lib/dbTypes";

export const runtime = "nodejs";

export async function POST() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profileRow } = await supabase
    .from("athlete_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (!profileRow) return NextResponse.json({ error: "no_profile" }, { status: 404 });
  const profile = profileRow as AthleteProfile;

  const today = new Date().toISOString().slice(0, 10);
  const calendar = await loadSeasonRaces(supabase, profile.id);
  const main = pickMainRace(calendar, today);
  if (!main) {
    return NextResponse.json(
      { error: "no_upcoming_race", detail: "Add a race to the calendar first — the plan is built backwards from it." },
      { status: 400 },
    );
  }

  // athlete_state is engine-owned (service role writes it); reading the current
  // one keeps the plan calibrated to what the athlete has actually logged.
  const admin = supabaseAdmin();
  const { data: stateRow } = await admin
    .from("athlete_state")
    .select("*")
    .eq("profile_id", profile.id)
    .single();
  if (!stateRow) return NextResponse.json({ error: "no_state" }, { status: 409 });

  const state = stateFromRow(stateRow as AthleteStateRow);
  const weeksToRace = planWeeksTo(main.date, today);

  // A race further out than the block's own length cannot be periodised for:
  // the cycle would be truncated to PLAN_MAX_WEEKS and taper at the end of it,
  // which is a taper weeks or months before the race it is aimed at. That gap
  // is transition work, and the race block starts once the race is in range.
  if (!raceBlockFits(weeksToRace)) {
    try {
      const block = await buildTransitionBlock({
        supabase,
        profile,
        state,
        startsOn: weekStartOf(today, 1),
        today,
      });
      return NextResponse.json({
        planId: block.planId,
        kind: "transition",
        weeks: block.weeks,
        ends_on: block.ends_on,
        main_race: { date: main.date, type: main.type, priority: main.priority },
        reason:
          `${main.date} is still ${weeksToRace}+ weeks out — too far to peak and taper for. ` +
          `You get a ${block.weeks}-week transition block first; the race cycle starts when the race is in range.`,
      });
    } catch (e) {
      return NextResponse.json(
        {
          error: "plan_build_failed",
          detail: `Could not build the transition block: ${e instanceof Error ? e.message : "unknown error"}`,
        },
        { status: 500 },
      );
    }
  }

  let planId: string;
  try {
    ({ planId } = await buildRaceBlock({
      supabase,
      profile,
      state,
      raceDate: main.date,
      calendar,
      startsOn: today,
      today,
    }));
  } catch (e) {
    // loadLibrary and persistPlan both throw; uncaught, that is a 500
    // with no body and the browser can only call it a parse error.
    return NextResponse.json(
      {
        error: "plan_build_failed",
        detail: `Could not build the plan: ${e instanceof Error ? e.message : "unknown error"}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    planId,
    weeksToRace,
    main_race: { date: main.date, type: main.type, priority: main.priority },
    supporting_races: racesForPlan(calendar, today, main.date).filter((r) => r.date !== main.date).length,
  });
}
