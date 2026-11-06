import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { rebasePlan } from "@/lib/rebasePlan";

export const runtime = "nodejs";

// Changing the running volume is a change to every remaining week, so it goes
// through the same rebase path the injury-recovery flow uses: the plan is
// rebuilt from today rather than mutated week by week.
const Body = z.object({
  weekly_km_peak: z.number().min(15).max(150).nullable(),
  runs_per_week: z.number().int().min(2).max(6).nullable(),
});

export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id, training_days_per_week")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  const runs = parsed.data.runs_per_week;
  // One session a week has to stay strength or station work.
  const maxRuns = profile.training_days_per_week - 1;
  if (runs != null && runs > maxRuns) {
    return NextResponse.json(
      {
        error: "too_many_runs",
        detail: `${runs} runs need ${runs + 1} training days — you train ${profile.training_days_per_week}. One session a week stays strength or station work.`,
      },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("athlete_profiles")
    .update({ weekly_km_peak: parsed.data.weekly_km_peak, runs_per_week: runs })
    .eq("id", profile.id);
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });

  // RLS scopes this to the caller's own plan.
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .in("status", ["active", "paused"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return NextResponse.json({ ok: true, rebased: false });

  let newPlanId: string | null = null;
  try {
    newPlanId = await rebasePlan(
      supabaseAdmin(),
      plan.id,
      parsed.data.weekly_km_peak
        ? `Running volume set to ${parsed.data.weekly_km_peak} km at the peak${runs ? ` across ${runs} runs a week` : ""} — the remaining weeks were rebuilt around it.`
        : "Running volume handed back to the engine — the remaining weeks were rebuilt.",
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

  return NextResponse.json({ ok: true, rebased: Boolean(newPlanId), planId: newPlanId });
}
