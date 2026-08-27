// ============================================================================
// Level and division — the two things about the athlete the plan is built for.
//
// Both were written once at onboarding and never again, which left the single
// biggest determinant of a plan's content unreachable: TRAINING_MIX is keyed
// on level as well as phase, and all three session catalogues (compromised
// running, station work, intervals) pick by level. Someone training for sub-70
// while filed as intermediate simply gets a different plan than the one they
// want. Division is the same story for every kilo in it.
//
// The one thing this must not do is reset the calibration. initialAthleteState
// would rebuild pace zones and station tiers from the onboarding 5 k time and
// throw away everything the athlete has actually logged; rebasePlan works from
// the live athlete_state, so changing the profile column and rebasing keeps it.
// A new goal is not a fresh start.
//
// The goal time rides along here but behaves differently: it is what the plan
// is measured AGAINST, not something the plan is built from, so saving a new
// goal never rebuilds a week.
// ============================================================================
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { rebasePlan } from "@/lib/rebasePlan";
import { frequencyAdvice } from "@/lib/engine";

export const runtime = "nodejs";

const Body = z.object({
  experience_level: z.enum(["beginner", "intermediate", "advanced", "elite", "world_class"]),
  division: z.enum(["open", "pro", "doubles", "masters_open", "masters_pro"]),
  /** The finish time being trained for. 30 min to 6 h, or cleared. */
  goal_race_time_sec: z.number().int().min(1800).max(21600).nullable().optional(),
});

export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const body = parsed.data;

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id, training_days_per_week, doubles_per_week, experience_level, division")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  // The goal does not shape the plan — it is the thing the plan is measured
  // against — so changing only the goal must not rebuild anyone's weeks.
  const shapeChanged =
    profile.experience_level !== body.experience_level || profile.division !== body.division;

  const { error } = await supabase
    .from("athlete_profiles")
    .update({
      experience_level: body.experience_level,
      division: body.division,
      ...(body.goal_race_time_sec === undefined
        ? {}
        : { goal_race_time_sec: body.goal_race_time_sec }),
    })
    .eq("id", profile.id);
  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }

  // What the new level expects of a week, against what the athlete trains.
  const advice = frequencyAdvice(
    body.experience_level,
    profile.training_days_per_week ?? 4,
    profile.doubles_per_week ?? 0,
  );
  const warnings = advice.verdict === "ok" ? [] : [advice.note];

  if (!shapeChanged) return NextResponse.json({ ok: true, rebased: false, warnings });

  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("profile_id", profile.id)
    .in("status", ["active", "paused"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return NextResponse.json({ ok: true, rebased: false, warnings });

  try {
    const newPlanId = await rebasePlan(
      supabaseAdmin(),
      plan.id,
      `Training for ${body.experience_level.replace("_", " ")} in the ${body.division.replace("_", " ")} division — the remaining weeks were rebuilt around it.`,
    );
    return NextResponse.json({ ok: true, rebased: true, planId: newPlanId, warnings });
  } catch (e) {
    return NextResponse.json(
      {
        error: "rebase_failed",
        detail: `Your level was saved, but the plan could not be rebuilt: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      },
      { status: 500 },
    );
  }
}
