import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { predictRaceTime, type AthleteProfile, type BenchmarkSample } from "@/lib/engine";
import { stateFromRow, type AthleteStateRow } from "@/lib/dbTypes";
import { syncPlanWeekStatuses } from "@/lib/planClock";

// B2 (fixes M6): record a benchmark result and recalibrate the race-time
// prognosis from it — closes the loop the schema always had tables for.
const Body = z.object({
  slug: z.string().min(1),
  value: z.number().positive(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  const { data: def } = await supabase
    .from("benchmark_definitions")
    .select("id, slug, name")
    .eq("slug", parsed.data.slug)
    .single();
  if (!def) return NextResponse.json({ error: "unknown_benchmark" }, { status: 404 });

  // Phase context from plan progress (start / mid / pre_race).
  const { data: plan } = await supabase
    .from("plans")
    .select("id, total_weeks, generated_at")
    .eq("profile_id", profile.id)
    .eq("status", "active")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let phaseContext: "start" | "mid" | "pre_race" = "start";
  if (plan) {
    await syncPlanWeekStatuses(supabase, plan);
    const { data: cur } = await supabase
      .from("plan_weeks")
      .select("week_number")
      .eq("plan_id", plan.id)
      .eq("status", "current")
      .maybeSingle();
    const ratio = cur ? cur.week_number / plan.total_weeks : 0;
    phaseContext = ratio >= 0.75 ? "pre_race" : ratio >= 0.34 ? "mid" : "start";
  }

  const { error: insErr } = await supabase.from("benchmark_results").insert({
    profile_id: profile.id,
    benchmark_id: def.id,
    plan_id: plan?.id ?? null,
    phase_context: phaseContext,
    value: parsed.data.value,
  });
  if (insErr) return NextResponse.json({ error: "insert_failed", detail: insErr.message }, { status: 500 });

  // Recompute the prognosis with all latest benchmark samples (engine-owned
  // state → service role).
  const admin = supabaseAdmin();
  const { data: stateRow } = await admin
    .from("athlete_state")
    .select("*")
    .eq("profile_id", profile.id)
    .single();
  if (!stateRow) return NextResponse.json({ ok: true });

  const { data: defs } = await admin.from("benchmark_definitions").select("id, slug");
  const idToSlug = new Map<string, string>((defs ?? []).map((d) => [d.id, d.slug]));
  const { data: benchRows } = await admin
    .from("benchmark_results")
    .select("benchmark_id, value, recorded_at")
    .eq("profile_id", profile.id)
    .order("recorded_at", { ascending: false });
  const seen = new Set<string>();
  const samples: BenchmarkSample[] = [];
  for (const b of benchRows ?? []) {
    const slug = idToSlug.get(b.benchmark_id);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      samples.push({ slug, value: Number(b.value) });
    }
  }

  const state = stateFromRow(stateRow as AthleteStateRow);
  const previous = state.predicted_race_time_sec;
  const predicted = predictRaceTime(profile as AthleteProfile, state, samples);

  await admin
    .from("athlete_state")
    .update({ predicted_race_time_sec: predicted, last_recalc_at: new Date().toISOString() })
    .eq("profile_id", profile.id);

  if (plan && previous !== predicted) {
    const mins = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
    await admin.from("plan_adjustments").insert({
      plan_id: plan.id,
      layer: "micro",
      trigger: "benchmark_result",
      action_taken: { type: "prognosis", benchmark: def.slug, from: previous, to: predicted },
      reason: `${def.name} logged — estimated finish recalibrated to ${mins(predicted)}.`,
    });
  }

  return NextResponse.json({ ok: true, predicted_race_time_sec: predicted, phase_context: phaseContext });
}
