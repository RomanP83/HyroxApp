import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { rebasePlan } from "@/lib/rebasePlan";
import { assessWeekPreferences } from "@/lib/engine";

export const runtime = "nodejs";

// Which weekday carries the long run, which carry strength, which are rest.
// Like the running volume, this changes every remaining week, so it goes
// through the same rebase path rather than mutating week by week.
const Day = z.number().int().min(1).max(7);
const Body = z.object({
  preferred_long_run_day: Day.nullable(),
  preferred_strength_days: z.array(Day).max(4),
  preferred_rest_days: z.array(Day).max(4),
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
    .select("id, training_days_per_week, runs_per_week, doubles_per_week")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

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
  if (body.preferred_rest_days.length > 7 - profile.training_days_per_week) {
    return NextResponse.json(
      {
        error: "too_many_rest_days",
        detail: `You train ${profile.training_days_per_week} days, so at most ${7 - profile.training_days_per_week} can be rest days.`,
      },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("athlete_profiles")
    .update({
      preferred_long_run_day: body.preferred_long_run_day,
      preferred_strength_days: body.preferred_strength_days,
      preferred_rest_days: body.preferred_rest_days,
    })
    .eq("id", profile.id);
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });

  // What the pins cost, in the athlete's own words — hard pin, soft warn.
  const warnings = assessWeekPreferences(
    {
      longRunDay: body.preferred_long_run_day,
      strengthDays: body.preferred_strength_days,
      restDays: body.preferred_rest_days,
    },
    {
      trainingDays: profile.training_days_per_week,
      runsPerWeek: profile.runs_per_week,
      doublesPerWeek: profile.doubles_per_week ?? 0,
    },
  );

  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .in("status", ["active", "paused"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return NextResponse.json({ ok: true, rebased: false, warnings });

  const newPlanId = await rebasePlan(
    supabaseAdmin(),
    plan.id,
    "You set the shape of your week — the remaining weeks were rebuilt around your fixed days.",
  );

  return NextResponse.json({ ok: true, rebased: Boolean(newPlanId), planId: newPlanId, warnings });
}
