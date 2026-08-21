// ============================================================================
// Reset a single logged day (PP3 — the plan bends, and so does a mis-tap).
//
// Logging a session is not a plain status flip: Layer-1 micro-calibration
// folds it into athlete_state (station tiers, pace zones, strength modifier,
// loads) and writes plan_adjustments. Undoing one day therefore has to undo
// that calibration too — otherwise an accidental "Harder" keeps nudging the
// plan forever.
//
// Strategy: every log carries `state_before` (written by applyMicroForSession).
// Reset restores that snapshot, drops the log plus the audit rows it caused,
// and REPLAYS every later log of the same plan in chronological order. The
// chain stays deterministic — the outcome equals "this day was never logged".
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyMicroForSession } from "@/lib/adaptiveRunner";
import { stateFromSnapshot } from "@/lib/dbTypes";

export interface ResetOutcome {
  /** false when the day only had a status (e.g. "skipped"), no log row. */
  hadLog: boolean;
  /** true when athlete_state was rolled back to the pre-log snapshot. */
  stateRestored: boolean;
  /** how many later logs were recalibrated on top of the restored state. */
  replayed: number;
  /** user-facing one-liner, mirrored into plan_adjustments (PP1). */
  reason: string;
}

interface LogRow {
  session_id: string;
  completed_at: string;
}

/**
 * Logs that have to be replayed after `afterIso`, oldest first. Pure so the
 * ordering rule (the part that makes the replay deterministic) is testable
 * without a database.
 */
export function replayOrder(logs: LogRow[], afterIso: string, excludeSessionId: string): string[] {
  return logs
    .filter((l) => l.session_id !== excludeSessionId && l.completed_at > afterIso)
    .sort((a, b) => (a.completed_at < b.completed_at ? -1 : 1))
    .map((l) => l.session_id);
}

export async function resetSessionLog(
  admin: SupabaseClient,
  sessionId: string,
): Promise<ResetOutcome | null> {
  const { data: session } = await admin
    .from("sessions")
    .select("id, plan_id, title, status")
    .eq("id", sessionId)
    .single();
  if (!session) return null;

  const { data: log } = await admin
    .from("session_logs")
    .select("completed_at, state_before")
    .eq("session_id", sessionId)
    .maybeSingle();

  // ── Case 1: a skipped day. No log, no calibration — just hand the day back.
  if (!log) {
    if (session.status === "planned") {
      return { hadLog: false, stateRestored: false, replayed: 0, reason: "Nothing to reset." };
    }
    await admin.from("sessions").update({ status: "planned" }).eq("id", sessionId);
    const reason = `"${session.title}" is back on your plan — the skip is undone.`;
    await auditReset(admin, session.plan_id, sessionId, reason);
    return { hadLog: false, stateRestored: false, replayed: 0, reason };
  }

  // ── Case 2: a logged day. Roll the calibration back, then replay the rest.
  const snapshot = stateFromSnapshot(log.state_before);

  const { data: laterRaw } = await admin
    .from("session_logs")
    .select("session_id, completed_at, sessions!inner(plan_id)")
    .eq("sessions.plan_id", session.plan_id)
    .order("completed_at", { ascending: true });
  const later = snapshot
    ? replayOrder((laterRaw ?? []) as unknown as LogRow[], log.completed_at, sessionId)
    : [];

  // Audit rows caused by this log — and by the logs we are about to replay,
  // which re-create their own. Manual moves / macro rows carry no session_id
  // and are never touched.
  await admin
    .from("plan_adjustments")
    .delete()
    .in("session_id", [sessionId, ...later])
    .eq("trigger", "session_logged");

  await admin.from("session_logs").delete().eq("session_id", sessionId);
  // Back to "planned" — the day is loggable again. A day that had been moved
  // keeps its day_hint, it just loses the "moved" pill.
  await admin.from("sessions").update({ status: "planned" }).eq("id", sessionId);

  if (snapshot) {
    const { data: plan } = await admin
      .from("plans")
      .select("profile_id")
      .eq("id", session.plan_id)
      .single();
    if (plan) {
      await admin
        .from("athlete_state")
        .update({
          acute_load_7d: snapshot.acute_load_7d,
          chronic_load_28d: snapshot.chronic_load_28d,
          acwr: snapshot.acwr,
          pace_zones: snapshot.pace_zones,
          station_tiers: snapshot.station_tiers,
          predicted_race_time_sec: snapshot.predicted_race_time_sec,
          strength_modifier: snapshot.strength_modifier,
          pace_zones_ref: snapshot.pace_zones_ref,
          pace_ref_at: snapshot.pace_ref_at,
          last_recalc_at: new Date().toISOString(),
        })
        .eq("profile_id", plan.profile_id);
    }
  }

  // Replay the days that came after, oldest first, so their calibration sits
  // on the corrected state (asOf keeps "previous session of this type" honest).
  const byId = new Map<string, string>(
    ((laterRaw ?? []) as unknown as LogRow[]).map((l) => [l.session_id, l.completed_at]),
  );
  for (const id of later) {
    await applyMicroForSession(admin, id, { asOf: byId.get(id) });
  }

  const reason = snapshot
    ? `You reset "${session.title}" — that log and everything it changed is rolled back.`
    : `You reset "${session.title}" — the log is gone. Your fitness state keeps the earlier calibration (this day was logged before resets existed).`;
  await auditReset(admin, session.plan_id, sessionId, reason);

  return { hadLog: true, stateRestored: Boolean(snapshot), replayed: later.length, reason };
}

async function auditReset(
  admin: SupabaseClient,
  planId: string,
  sessionId: string,
  reason: string,
): Promise<void> {
  await admin.from("plan_adjustments").insert({
    plan_id: planId,
    session_id: sessionId,
    layer: "micro",
    trigger: "manual_reset",
    action_taken: { type: "reset", session_id: sessionId },
    reason,
  });
}
