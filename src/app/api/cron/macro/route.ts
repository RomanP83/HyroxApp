import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { macroGuardrails } from "@/lib/engine";
import { computeLoadState } from "@/lib/engine/adaptive";
import { stateFromRow, type AthleteStateRow } from "@/lib/dbTypes";
import { rebasePlan } from "@/lib/rebasePlan";
import { loadTuning } from "@/lib/engineConfig";
import { syncPlanWeekStatuses } from "@/lib/planClock";

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

/** Claim and apply one week-level scale atomically (safe across cron retries). */
async function applyScale(
  admin: SupabaseClient,
  planId: string,
  weekId: string,
  directive: "auto_deload" | "trim_week" | "ramp_up",
  multiplier: number,
  markDeload = false,
): Promise<boolean> {
  const { data, error } = await admin.rpc("apply_macro_scale", {
    p_plan: planId,
    p_week: weekId,
    p_directive: directive,
    p_multiplier: multiplier,
    p_mark_deload: markDeload,
  });
  if (error) throw new Error(`apply_macro_scale: ${error.message}`);
  return Boolean(data);
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = supabaseAdmin();

  const { data: plans, error: plansError } = await admin
    .from("plans")
    .select("id, profile_id, status, generated_at, total_weeks")
    .in("status", ["active", "paused"]);
  if (plansError) throw new Error(`macro plans: ${plansError.message}`);

  const now = Date.now();
  const results: Record<string, string[]> = {};
  const tuning = await loadTuning(admin);

  for (const plan of plans ?? []) {
    if (await syncPlanWeekStatuses(admin, plan) > plan.total_weeks) continue;

    const { data: stateRow } = await admin
      .from("athlete_state")
      .select("*")
      .eq("profile_id", plan.profile_id)
      .single();
    if (!stateRow) continue;

    const { data: logs, error: logsError } = await admin
      .from("session_logs")
      .select("rpe_actual, duration_actual_min, completed_at, sessions!inner(plan_id)")
      .eq("sessions.plan_id", plan.id)
      .order("completed_at", { ascending: false });
    if (logsError) throw new Error(`macro logs: ${logsError.message}`);

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

    // Load windows age even on days without a new log. Never use a stale
    // cached ACWR (including the old cold-start value) for nightly decisions.
    const state = {
      ...stateFromRow(stateRow as AthleteStateRow),
      ...computeLoadState((logs ?? []).map((log) => ({
        at: log.completed_at,
        srpe: (log.rpe_actual ?? 0) * (log.duration_actual_min ?? 0),
      })), new Date(now)),
    };

    const { directives, adjustments } = macroGuardrails({
      state,
      avgRpe14d,
      daysSinceLastSession,
      injuryFlag: false,
      planStatus: plan.status,
      tuning,
    });

    const applied: string[] = [];
    const appliedActions = new Set<string>();
    let rebasedTo: string | null = null;

    for (const d of directives) {
      if (d.type === "none") continue;
      let didApply = false;

      if (d.type === "auto_deload") {
        // Turn the next upcoming week into a deload.
        const { data: nextWeek } = await admin
          .from("plan_weeks")
          .select("id, is_deload")
          .eq("plan_id", plan.id)
          .eq("status", "upcoming")
          .order("week_number", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (nextWeek && !nextWeek.is_deload) {
          didApply = await applyScale(admin, plan.id, nextWeek.id, "auto_deload", 0.6, true);
          if (didApply) appliedActions.add("auto_deload");
        }
      } else if (d.type === "trim_week") {
        // B3: actually reduce the remaining sessions of the current week.
        const { data: curWeek } = await admin
          .from("plan_weeks")
          .select("id")
          .eq("plan_id", plan.id)
          .eq("status", "current")
          .maybeSingle();
        if (curWeek) {
          didApply = await applyScale(admin, plan.id, curWeek.id, "trim_week", d.multiplier);
          if (didApply) appliedActions.add("trim_week");
        }
      } else if (d.type === "ramp_up") {
        // B3: eased re-entry — scale the next two upcoming weeks down.
        const { data: weeks } = await admin
          .from("plan_weeks")
          .select("id")
          .eq("plan_id", plan.id)
          .eq("status", "upcoming")
          .order("week_number", { ascending: true })
          .limit(d.weeks);
        for (const week of weeks ?? []) {
          const changed = await applyScale(admin, plan.id, week.id, "ramp_up", 0.8);
          didApply ||= changed;
        }
        if (didApply) appliedActions.add("ramp_up");
      } else if (d.type === "rehab") {
        const { error } = await admin.from("plans").update({ status: "rehab" }).eq("id", plan.id);
        if (error) throw new Error(`rehab update: ${error.message}`);
        didApply = true;
        appliedActions.add("rehab_mode");
      } else if (d.type === "rebase") {
        // B3: regenerate from today — never mutate past weeks (§5).
        rebasedTo = await rebasePlan(
          admin,
          plan.id,
          adjustments.find((a) => a.trigger === "pause")?.reason ??
            "Plan rebuilt from today after a training break.",
        );
        didApply = Boolean(rebasedTo);
        if (didApply) appliedActions.add("rebase");
      }

      if (didApply) applied.push(d.type);
    }

    // Retries that made no change must not create duplicate audit history.
    // Rebase writes its own audit row on the new plan.
    const auditRows = adjustments.filter((a) => {
      const action = String(a.action_taken.type ?? "");
      return appliedActions.has(action) && !(rebasedTo && a.trigger === "pause");
    });
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
