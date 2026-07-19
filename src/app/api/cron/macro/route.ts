import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { macroGuardrails, type AthleteState } from "@/lib/engine";

export const runtime = "nodejs";

// Layer-2 macro-guardrails, run nightly (Vercel Cron / pg_cron equivalent).
// ACWR watch, auto-deload, rebase, rehab — see Implementation Plan §5 Layer 2.
function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // A2/M8: never run open in production — a missing secret only passes in dev.
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = supabaseAdmin();

  const { data: plans } = await admin
    .from("plans")
    .select("id, profile_id, status, generated_at")
    .in("status", ["active", "paused"]);

  const now = Date.now();
  const results: Record<string, string[]> = {};

  for (const plan of plans ?? []) {
    const { data: stateRow } = await admin
      .from("athlete_state")
      .select("*")
      .eq("profile_id", plan.profile_id)
      .single();
    if (!stateRow) continue;

    const { data: logs } = await admin
      .from("session_logs")
      .select("rpe_actual, completed_at, sessions!inner(plan_id)")
      .eq("sessions.plan_id", plan.id)
      .order("completed_at", { ascending: false });

    const recent14 = (logs ?? []).filter(
      (l: any) => now - new Date(l.completed_at).getTime() <= 14 * 86_400_000,
    );
    const avgRpe14d =
      recent14.length > 0
        ? recent14.reduce((s: number, l: any) => s + (l.rpe_actual ?? 0), 0) / recent14.length
        : null;
    // A2/K2: without logs, "days inactive" counts from plan creation — a plan
    // generated on Monday must not be rebased in its first night.
    const daysSinceLastSession = logs?.length
      ? Math.floor((now - new Date((logs[0] as any).completed_at).getTime()) / 86_400_000)
      : Math.floor((now - new Date(plan.generated_at).getTime()) / 86_400_000);

    const state: AthleteState = {
      acute_load_7d: Number(stateRow.acute_load_7d),
      chronic_load_28d: Number(stateRow.chronic_load_28d),
      acwr: Number(stateRow.acwr),
      pace_zones: stateRow.pace_zones,
      station_tiers: stateRow.station_tiers,
      predicted_race_time_sec: stateRow.predicted_race_time_sec,
      strength_modifier: Number(stateRow.strength_modifier ?? 1),
      pace_zones_ref: stateRow.pace_zones_ref ?? stateRow.pace_zones,
      pace_ref_at: stateRow.pace_ref_at ?? null,
    };

    const { directives, adjustments } = macroGuardrails({
      state,
      avgRpe14d,
      daysSinceLastSession,
      injuryFlag: false,
      planStatus: plan.status,
    });

    const applied: string[] = [];
    for (const d of directives) {
      if (d.type === "none") continue;
      applied.push(d.type);
      if (d.type === "auto_deload") {
        // Turn the next upcoming week into a deload.
        const { data: nextWeek } = await admin
          .from("plan_weeks")
          .select("id")
          .eq("plan_id", plan.id)
          .eq("status", "upcoming")
          .order("week_number", { ascending: true })
          .limit(1)
          .single();
        if (nextWeek) {
          await admin.from("plan_weeks").update({ is_deload: true }).eq("id", nextWeek.id);
        }
      } else if (d.type === "rehab") {
        await admin.from("plans").update({ status: "rehab" }).eq("id", plan.id);
      } else if (d.type === "rebase") {
        await admin
          .from("plan_weeks")
          .update({ status: "rebased" })
          .eq("plan_id", plan.id)
          .eq("status", "current");
      }
      // trim_week / ramp_up are recorded as adjustments for the UI to surface.
    }

    if (adjustments.length) {
      await admin.from("plan_adjustments").insert(
        adjustments.map((a) => ({
          plan_id: plan.id,
          layer: a.layer,
          trigger: a.trigger,
          action_taken: a.action_taken,
          reason: a.reason,
        })),
      );
    }
    if (applied.length) results[plan.id] = applied;
  }

  return NextResponse.json({ ok: true, applied: results });
}

// Vercel Cron invokes with GET; reuse the same handler.
export const GET = POST;
