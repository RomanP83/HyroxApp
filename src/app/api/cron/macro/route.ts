import { loadVacations } from "@/lib/vacations";
import { vacationDaysBetween } from "@/lib/engine";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  macroGuardrails,
  raceBlockFits,
  type AthleteProfile,
  type AthleteState,
} from "@/lib/engine";
import { stateFromRow, type AthleteStateRow } from "@/lib/dbTypes";
import { rebasePlan } from "@/lib/rebasePlan";
import { loadTuning } from "@/lib/engineConfig";
import { currentWeekNumber, weekStartOf } from "@/lib/planWeek";
import { raceIsBehind } from "@/lib/planWeek";
import { loadSeasonRaces, pickMainRace, planWeeksTo } from "@/lib/seasonCalendar";
import { buildTransitionBlock } from "@/lib/transitionBlock";
import { buildRaceBlock } from "@/lib/raceBlock";
import { computeLoadState } from "@/lib/engine/adaptive";
import { dateInTrainingZone } from "@/lib/planClock";

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
    .select("id, profile_id, status, kind, generated_at, starts_on, total_weeks, race_date")
    .in("status", ["active", "paused"]);
  if (plansError) throw new Error(`macro plans: ${plansError.message}`);

  const now = Date.now();
  const results: Record<string, string[]> = {};
  const tuning = await loadTuning(admin);

  const today = new Date().toISOString().slice(0, 10);

  for (const plan of plans ?? []) {
    // A plan whose race has been and gone is a record, not a plan. It gets
    // closed here rather than adapted: planWeeksTo counts weeks TO the race,
    // so rebasing against a past date clamps to the floor and produces a
    // two-week taper aimed at a day that is over — and the seven-days-inactive
    // rebase below is precisely what the week after a race triggers.
    if (raceIsBehind(String(plan.race_date), today)) {
      await admin.from("plans").update({ status: "completed" }).eq("id", plan.id);
      results[plan.id] = ["race day passed — plan closed"];
      continue;
    }

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
    const lastActive = logs?.length
      ? new Date(logs[0].completed_at).getTime()
      : new Date(plan.generated_at).getTime();
    // Days on vacation are not "days without a session": a planned holiday
    // must not come back as a rebuilt plan.
    const daysSinceLastSession = Math.max(
      0,
      Math.floor((now - lastActive) / 86_400_000) -
        vacationDaysBetween(lastActive, now, await loadVacations(admin, plan.profile_id)),
    );

    // Load windows age even on days without a new log. Never use a stale
    // cached ACWR (including the old cold-start value) for nightly decisions.
    const state = {
      ...stateFromRow(stateRow as AthleteStateRow),
      ...computeLoadState((logs ?? []).map((log) => ({
        at: log.completed_at,
        srpe: (log.rpe_actual ?? 0) * (log.duration_actual_min ?? 0),
      })), new Date(now)),
    };

    // Is this plan still the right SHAPE? A race cycle ends in a peak and a
    // taper, and both are promises about a date — so a cycle aimed at a race
    // still far outside its own length was tapering months early, and a
    // transition block whose race has come into range would never start
    // periodising on its own. Reconciled here, nightly, before anything else:
    // a plan of the wrong shape is not worth deloading or rebasing.
    const reshaped = await reconcileBlockShape(admin, plan, state, today);
    if (reshaped) {
      results[plan.id] = [reshaped];
      continue;
    }

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
        const thisWeek = currentWeekNumber({
          startsOn: String(plan.starts_on).slice(0, 10),
          today: new Date().toISOString().slice(0, 10),
          totalWeeks: plan.total_weeks,
        });
        const { data: curWeek } = await admin
          .from("plan_weeks")
          .select("id")
          .eq("plan_id", plan.id)
          .eq("week_number", thisWeek)
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

/**
 * Put a plan into the shape its calendar actually calls for.
 *
 * Two directions, and both used to be dead ends. A race cycle built for a race
 * beyond PLAN_MAX_WEEKS was truncated and tapered at the end of the truncation
 * — a taper weeks or months before the race. And nothing ever turned a
 * transition block back into a race cycle, so an athlete who entered a race a
 * year out would have sat in transition work until they noticed.
 *
 * Returns a description when the plan was replaced, null when it was already
 * the right shape.
 */
async function reconcileBlockShape(
  admin: SupabaseClient,
  plan: { id: string; profile_id: string; kind?: string | null; race_date: string },
  state: AthleteState,
  today: string,
): Promise<string | null> {
  const { data: profileRow } = await admin
    .from("athlete_profiles")
    .select("*")
    .eq("id", plan.profile_id)
    .single();
  if (!profileRow) return null;
  const profile = profileRow as AthleteProfile;
  const startsOn = weekStartOf(today, 1);

  if (plan.kind === "transition") {
    // A transition block's race_date is its own end, so the real race has to
    // come from the calendar.
    const calendar = await loadSeasonRaces(admin, plan.profile_id);
    const main = pickMainRace(calendar, today);
    if (!main) return null;
    const weeksToRace = planWeeksTo(main.date, startsOn);
    if (!raceBlockFits(weeksToRace)) return null;

    await buildRaceBlock({
      supabase: admin,
      profile,
      state,
      raceDate: main.date,
      calendar,
      startsOn,
      today,
    });
    return `race in ${weeksToRace} weeks — transition block became a race cycle`;
  }

  const weeksToRace = planWeeksTo(String(plan.race_date).slice(0, 10), startsOn);
  if (raceBlockFits(weeksToRace)) return null;

  const block = await buildTransitionBlock({
    supabase: admin,
    profile,
    state,
    startsOn,
    today,
  });
  return `race still ${weeksToRace}+ weeks out — race cycle became a ${block.weeks}-week transition block`;
}
