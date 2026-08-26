// ============================================================================
// The block between goals.
//
// Every plan the app builds is periodised towards a race, and until now that
// was the only thing it could build: onboarding refuses a plan without a race
// date, and the season route answers "no_upcoming_race". So the week after a
// race there was nothing to do — and worse, the nightly job would rebase the
// finished plan into a two-week taper aimed at a date in the past.
//
// A transition block is what belongs there: base work at maintenance load,
// four weeks by default, no benchmark, no simulation, no taper. It ends on its
// own last day rather than a race, and picking a real race on /season replaces
// it like any other plan.
// ============================================================================
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { loadLibrary, persistPlan } from "@/lib/persistPlan";
import { loadDayOverrides } from "@/lib/dayOverrides";
import { nextMonday, weekStartOf } from "@/lib/planWeek";
import { generatePlan, TRANSITION_WEEKS, type AthleteProfile } from "@/lib/engine";
import { stateFromRow, type AthleteStateRow } from "@/lib/dbTypes";

export const runtime = "nodejs";

const Body = z.object({
  weeks: z.number().int().min(2).max(12).optional(),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const weeks = parsed.data.weeks ?? TRANSITION_WEEKS;

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

  const admin = supabaseAdmin();
  const { data: stateRow } = await admin
    .from("athlete_state")
    .select("*")
    .eq("profile_id", profile.id)
    .single();
  if (!stateRow) return NextResponse.json({ error: "no_state" }, { status: 409 });

  const today = new Date().toISOString().slice(0, 10);
  const startsOn = weekStartOf(parsed.data.starts_on ?? nextMonday(today), 1);
  // The block's own last day stands where a race date would: the plan ends
  // when it ends, and nothing is periodised towards it.
  const endsOn = weekStartOf(startsOn, weeks + 1);

  let planId: string;
  try {
    const plan = generatePlan({
      profile,
      state: stateFromRow(stateRow as AthleteStateRow),
      library: await loadLibrary(supabase),
      weeksToRace: weeks,
      mode: "transition",
      startDate: startsOn,
      dayOverrides: await loadDayOverrides(supabase, profile.id, today),
    });
    planId = await persistPlan(
      supabase,
      { profileId: profile.id, raceDate: endsOn, startsOn },
      plan,
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: "plan_build_failed",
        detail: `Could not build the transition block: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ planId, weeks, starts_on: startsOn, ends_on: endsOn });
}
