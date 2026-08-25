import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { rebasePlan } from "@/lib/rebasePlan";
import { assessWeekPreferences } from "@/lib/engine";

export const runtime = "nodejs";

// The whole shape of a training week: how many days, how many of them carry a
// second session, and which weekdays are fixed.
// Like the running volume, this changes every remaining week, so it goes
// through the same rebase path rather than mutating week by week.
const Day = z.number().int().min(1).max(7);
const Body = z.object({
  training_days_per_week: z.number().int().min(3).max(6),
  doubles_per_week: z.number().int().min(0).max(3),
  preferred_long_run_day: Day.nullable(),
  preferred_strength_days: z.array(Day).max(4),
  preferred_rest_days: z.array(Day).max(4),
  preferred_double_days: z.array(Day).max(3),
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
    .select("id, runs_per_week")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  const trainingDays = body.training_days_per_week;

  // A day cannot be both a rest day and a training day — that is a typo, not
  // a preference, and the plan would silently pick one of them.
  const rest = new Set(body.preferred_rest_days);
  const clash = [
    ...(body.preferred_long_run_day != null && rest.has(body.preferred_long_run_day)
      ? ["the long run"]
      : []),
    ...(body.preferred_strength_days.some((d) => rest.has(d)) ? ["a strength day"] : []),
  ];
  if (clash.length) {
    return NextResponse.json(
      {
        error: "rest_day_clash",
        detail: `You put ${clash.join(" and ")} on a rest day. Pick one — the plan will not train on a day you called rest.`,
      },
      { status: 400 },
    );
  }
  if (body.preferred_rest_days.length > 7 - trainingDays) {
    return NextResponse.json(
      {
        error: "too_many_rest_days",
        detail: `${trainingDays} training days leave at most ${7 - trainingDays} rest days — you marked ${body.preferred_rest_days.length}.`,
      },
      { status: 400 },
    );
  }
  if (body.preferred_double_days.some((d) => rest.has(d))) {
    return NextResponse.json(
      {
        error: "rest_day_clash",
        detail:
          "You pinned a double day on a rest day. A second session needs a first one — pick one or the other.",
      },
      { status: 400 },
    );
  }
  if (body.preferred_double_days.length > body.doubles_per_week) {
    return NextResponse.json(
      {
        error: "too_many_double_days",
        detail: `You pinned ${body.preferred_double_days.length} double days but train twice on ${body.doubles_per_week} day${body.doubles_per_week === 1 ? "" : "s"} a week.`,
      },
      { status: 400 },
    );
  }
  if (body.preferred_strength_days.length > trainingDays) {
    return NextResponse.json(
      {
        error: "too_many_strength_days",
        detail: `You marked ${body.preferred_strength_days.length} strength days but train ${trainingDays} days a week.`,
      },
      { status: 400 },
    );
  }
  // Fewer training days can strand a running frequency that used to fit. One
  // session a week stays strength or station work, so runs cap at days - 1.
  const maxRuns = trainingDays - 1;
  if (profile.runs_per_week != null && profile.runs_per_week > maxRuns) {
    return NextResponse.json(
      {
        error: "runs_no_longer_fit",
        detail: `${trainingDays} training days leave room for ${maxRuns} runs, but yours is set to ${profile.runs_per_week}. Lower it under Running volume first — one session a week stays strength or station work.`,
      },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("athlete_profiles")
    .update({
      training_days_per_week: trainingDays,
      doubles_per_week: body.doubles_per_week,
      preferred_long_run_day: body.preferred_long_run_day,
      preferred_strength_days: body.preferred_strength_days,
      preferred_rest_days: body.preferred_rest_days,
      preferred_double_days: body.preferred_double_days,
    })
    .eq("id", profile.id);
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });

  // What the pins cost, in the athlete's own words — hard pin, soft warn.
  const warnings = assessWeekPreferences(
    {
      longRunDay: body.preferred_long_run_day,
      strengthDays: body.preferred_strength_days,
      restDays: body.preferred_rest_days,
      doubleDays: body.preferred_double_days,
    },
    { trainingDays, runsPerWeek: profile.runs_per_week, doublesPerWeek: body.doubles_per_week },
  );

  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .in("status", ["active", "paused"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return NextResponse.json({ ok: true, rebased: false, warnings });

  let newPlanId: string | null = null;
  try {
    newPlanId = await rebasePlan(
      supabaseAdmin(),
      plan.id,
      `Your week is now ${trainingDays} training days${body.doubles_per_week ? ` plus ${body.doubles_per_week} double${body.doubles_per_week > 1 ? "s" : ""}` : ""} — the remaining weeks were rebuilt around it.`,
    );
  } catch (e) {
    // A rebase touches the library and the persistence RPC, and both
    // throw. Letting that escape returns a 500 with no body, which the
    // browser can only report as a JSON parse error.
    return NextResponse.json(
      {
        error: "rebase_failed",
        detail: `Your settings were saved, but the plan could not be rebuilt: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, rebased: Boolean(newPlanId), planId: newPlanId, warnings });
}
