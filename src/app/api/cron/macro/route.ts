import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { macroGuardrails } from "@/lib/engine";
import { stateFromRow, type AthleteStateRow } from "@/lib/dbTypes";
import { rebasePlan } from "@/lib/rebasePlan";

export const runtime = "nodejs";

// Layer-2 macro-guardrails, run nightly (Vercel Cron / pg_cron equivalent).
// ACWR watch, auto-deload, rebase, rehab — see Implementation Plan §5 Layer 2.
// Since Phase B (B3) the directives are APPLIED, not just audited.
function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // A2/M8: never run open in production — a missing secret only passes in dev.
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Scale the planned duration of not-yet-logged sessions in given weeks. */
async function scaleSessions(
  admin: SupabaseClient,
  weekIds: string[],
  multiplier: number,
): Promise<void> {
  if (!weekIds.length) return;
  const { data: sessions } = await admin
    .from("sessions")
    .select("id, planned_duration_min")
    .in("week_id", weekIds)
    .in("status", ["planned", "moved"]);
  for (const s of sessions ?? []) {
    await admin
      .from("sessions")
      .update({ planned_duration_min: Math.max(15, Math.round(s.planned_duration_min * multiplier)) })
      .eq("id", s.id);
  }
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
      (l) => now - new Date(l.completed_at).getTime() <= 14 * 86_400_000,
    );
    const avgRpe14d =
      recent14.length > 0
        ? recent14.reduce((s, l) => s + (l.rpe_actual ?? 0), 0) / recent14.length
        : null;
    // A2/K2: without logs, "days inactive" counts from plan creation — a plan
    // generated on Monday must not be rebased in its first night.
    const daysSinceLastSession = logs?.length
      ? Math.floor((now - new Date(logs[0].completed_at).getTime()) / 86_400_000)
      : Math.floor((now - new Date(plan.generated_at).getTime()) / 86_400_000);

    const state = stateFromRow(stateRow as AthleteStateRow);

    const { directives, adjustments } = macroGuardrails({
      state,
      avgRpe14d,
      daysSinceLastSession,
      injuryFlag: false,
      planStatus: plan.status,
    });

    const applied: string[] = [];
    let rebasedTo: string | null = null;

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
          .maybeSingle();
        if (nextWeek) {
          await admin.from("plan_weeks").update({ is_deload: true }).eq("id", nextWeek.id);
          await scaleSessions(admin, [nextWeek.id], 0.6);
        }
      } else if (d.type === "trim_week") {
        // B3: actually reduce the remaining sessions of the current week.
        const { data: curWeek } = await admin
          .from("plan_weeks")
          .select("id")
          .eq("plan_id", plan.id)
          .eq("status", "current")
          .maybeSingle();
        if (curWeek) await scaleSessions(admin, [curWeek.id], d.multiplier);
      } else if (d.type === "ramp_up") {
        // B3: eased re-entry — scale the next two upcoming weeks down.
        const { data: weeks } = await admin
          .from("plan_weeks")
          .select("id")
          .eq("plan_id", plan.id)
          .eq("status", "upcoming")
          .order("week_number", { ascending: true })
          .limit(d.weeks);
        await scaleSessions(admin, (weeks ?? []).map((w) => w.id), 0.8);
      } else if (d.type === "rehab") {
        await admin.from("plans").update({ status: "rehab" }).eq("id", plan.id);
      } else if (d.type === "rebase") {
        // B3: regenerate from today — never mutate past weeks (§5).
        rebasedTo = await rebasePlan(
          admin,
          plan.id,
          adjustments.find((a) => a.trigger === "pause")?.reason ??
            "Plan rebuilt from today after a training break.",
        );
      }
    }

    // Rebase writes its own audit row on the NEW plan; skip the duplicate.
    const auditRows = adjustments.filter((a) => !(rebasedTo && a.trigger === "pause"));
    if (auditRows.length) {
      await admin.from("plan_adjustments").insert(
        auditRows.map((a) => ({
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
