// ============================================================================
// When week 1 begins.
//
// The plan's grid used to be anchored on the moment the athlete pressed the
// button, so a plan built on a Saturday gave week 1 two days. starts_on is
// that anchor made explicit, and this is where it moves.
//
// Moving it is not a cosmetic change. The plan has a fixed number of weeks
// counted to the race, so a later start with the same race date leaves the
// plan running past race day, and an earlier one skips weeks. Which is why
// the caller says explicitly whether to rebuild — and the page puts the
// consequence of each answer next to the button rather than picking quietly.
// ============================================================================
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { rebasePlan } from "@/lib/rebasePlan";
import { weekStartOf } from "@/lib/planWeek";

export const runtime = "nodejs";

const Body = z.object({
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** false shifts the calendar and keeps the weeks exactly as they are. */
  rebuild: z.boolean(),
});

export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const startsOn = weekStartOf(parsed.data.starts_on, 1);

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  const { data: plan } = await supabase
    .from("plans")
    .select("id, race_date, total_weeks, starts_on")
    .eq("profile_id", profile.id)
    .in("status", ["active", "paused", "rehab"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: "no_plan" }, { status: 404 });

  const raceDate = String(plan.race_date).slice(0, 10);
  if (startsOn > raceDate) {
    return NextResponse.json(
      {
        error: "starts_after_race",
        detail: `Your race is on ${raceDate}. A plan cannot start after the race it is built for.`,
      },
      { status: 400 },
    );
  }

  if (parsed.data.rebuild) {
    let newPlanId: string | null = null;
    try {
      newPlanId = await rebasePlan(
        supabaseAdmin(),
        plan.id,
        `Your plan now starts on ${startsOn} — the weeks were rebuilt to the runway that leaves.`,
        startsOn,
      );
    } catch (e) {
      return NextResponse.json(
        {
          error: "rebase_failed",
          detail: `The start date could not be applied: ${
            e instanceof Error ? e.message : "unknown error"
          }`,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, rebuilt: true, planId: newPlanId, starts_on: startsOn });
  }

  // Shift only: the weeks keep their content and slide along the calendar.
  const { error } = await supabase
    .from("plans")
    .update({ starts_on: startsOn })
    .eq("id", plan.id);
  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }

  // The plan's last week now ends here. If that is after the race, say so —
  // the athlete asked not to rebuild, so this is a warning, not a refusal.
  const lastWeekEnds = weekStartOf(startsOn, plan.total_weeks + 1);
  const warnings =
    lastWeekEnds > raceDate
      ? [
          `Your plan now runs past race day: ${plan.total_weeks} weeks from ${startsOn} ends after ${raceDate}. Rebuild it to fit the runway.`,
        ]
      : [];
  return NextResponse.json({ ok: true, rebuilt: false, starts_on: startsOn, warnings });
}
