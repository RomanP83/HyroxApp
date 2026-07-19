// ============================================================================
// Adaptive runner — server glue between the DB and the pure engine.
// applyMicroForSession() is the Layer-1 trigger: called after a session_logs
// insert (from the web app OR the Telegram quick-log). It loads context with
// the service-role client, runs microCalibrate(), and persists the new
// athlete_state + plan_adjustments audit rows.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  microCalibrate,
  stationForWeek,
  type AthleteProfile,
  type LoadEntry,
  type Station,
} from "@/lib/engine";
import type { BenchmarkSample } from "@/lib/engine";
import {
  stateFromRow,
  type AthleteStateRow,
  type LogWithSessionRow,
  type SessionWithWeekRow,
} from "@/lib/dbTypes";
import { loadTuning } from "@/lib/engineConfig";

export interface MicroOutcome {
  adjustments: { action_taken: Record<string, unknown>; reason: string }[];
  predicted_race_time_sec: number | null;
}

export async function applyMicroForSession(
  admin: SupabaseClient,
  sessionId: string,
): Promise<MicroOutcome | null> {
  // 1) Session + its week + plan.
  const { data: sessionRaw } = await admin
    .from("sessions")
    .select(
      "id, session_type, plan_id, intensity_rpe_target, planned_duration_min, plan_weeks!inner(week_number)",
    )
    .eq("id", sessionId)
    .single();
  if (!sessionRaw) return null;
  const session = sessionRaw as unknown as SessionWithWeekRow;

  const planId = session.plan_id;
  const weekNumber = session.plan_weeks.week_number;

  // 2) The log we just wrote.
  const { data: log } = await admin
    .from("session_logs")
    .select("rpe_actual, duration_actual_min, block_results")
    .eq("session_id", sessionId)
    .single();
  if (!log) return null;

  // 3) Plan -> profile -> state.
  const { data: plan } = await admin
    .from("plans")
    .select("profile_id")
    .eq("id", planId)
    .single();
  if (!plan) return null;
  const profileId = plan.profile_id as string;

  const { data: profileRow } = await admin
    .from("athlete_profiles")
    .select("*")
    .eq("id", profileId)
    .single();
  const { data: stateRow } = await admin
    .from("athlete_state")
    .select("*")
    .eq("profile_id", profileId)
    .single();
  if (!profileRow || !stateRow) return null;

  const profile = profileRow as AthleteProfile;
  const state = stateFromRow(stateRow as AthleteStateRow);

  // 4) Load history + previous same-type delta (from this race cycle).
  const { data: logsRaw } = await admin
    .from("session_logs")
    .select(
      "completed_at, rpe_actual, duration_actual_min, session_id, sessions!inner(session_type, intensity_rpe_target, plan_id)",
    )
    .eq("sessions.plan_id", planId)
    .order("completed_at", { ascending: false });
  const logs = (logsRaw ?? []) as unknown as LogWithSessionRow[];

  const loadHistory: LoadEntry[] = logs.map((l) => ({
    at: l.completed_at,
    srpe: (l.rpe_actual ?? 0) * (l.duration_actual_min ?? 0),
  }));

  const priorSameType = logs
    .filter((l) => l.session_id !== sessionId && l.sessions.session_type === session.session_type)
    .sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1))[0];
  const previousSameTypeDelta = priorSameType
    ? (priorSameType.rpe_actual ?? 0) - priorSameType.sessions.intensity_rpe_target
    : undefined;

  // 5) Benchmarks for prognosis.
  const { data: defs } = await admin.from("benchmark_definitions").select("id, slug");
  const idToSlug = new Map<string, string>((defs ?? []).map((d: any) => [d.id, d.slug]));
  const { data: benchRows } = await admin
    .from("benchmark_results")
    .select("benchmark_id, value, recorded_at")
    .eq("profile_id", profileId)
    .order("recorded_at", { ascending: false });
  const seen = new Set<string>();
  const benchmarks: BenchmarkSample[] = [];
  for (const b of benchRows ?? []) {
    const slug = idToSlug.get(b.benchmark_id);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      benchmarks.push({ slug, value: Number(b.value) });
    }
  }

  // 6) Optional actual run pace from block_results.
  let actualPaceSecKm: number | undefined;
  if (Array.isArray(log.block_results)) {
    const withPace = log.block_results.find(
      (r: any) => typeof r?.pace_actual_sec_km === "number",
    );
    if (withPace) actualPaceSecKm = withPace.pace_actual_sec_km;
  }

  const station: Station | undefined =
    session.session_type === "station_work" ? stationForWeek(weekNumber) : undefined;

  // 7) Run the pure engine (calibration constants from engine_config, D2).
  const tuning = await loadTuning(admin);
  const result = microCalibrate({
    state,
    profile,
    tuning,
    sessionType: session.session_type,
    station,
    rpeTarget: session.intensity_rpe_target,
    rpeActual: log.rpe_actual ?? session.intensity_rpe_target,
    durationActualMin: log.duration_actual_min ?? session.planned_duration_min,
    previousSameTypeDelta,
    actualPaceSecKm,
    loadHistory,
    benchmarks,
  });

  // 8) Persist new state + audit rows.
  await admin
    .from("athlete_state")
    .update({
      acute_load_7d: result.state.acute_load_7d,
      chronic_load_28d: result.state.chronic_load_28d,
      acwr: result.state.acwr,
      pace_zones: result.state.pace_zones,
      station_tiers: result.state.station_tiers,
      predicted_race_time_sec: result.state.predicted_race_time_sec,
      strength_modifier: result.state.strength_modifier,
      pace_zones_ref: result.state.pace_zones_ref,
      pace_ref_at: result.state.pace_ref_at,
      last_recalc_at: new Date().toISOString(),
    })
    .eq("profile_id", profileId);

  if (result.adjustments.length) {
    await admin.from("plan_adjustments").insert(
      result.adjustments.map((a) => ({
        plan_id: planId,
        layer: a.layer,
        trigger: a.trigger,
        action_taken: a.action_taken,
        reason: a.reason,
      })),
    );
  }

  return {
    adjustments: result.adjustments.map((a) => ({
      action_taken: a.action_taken,
      reason: a.reason,
    })),
    predicted_race_time_sec: result.state.predicted_race_time_sec,
  };
}
