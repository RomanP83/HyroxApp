// ============================================================================
// Adaptive engine v1 — the v1.1 heart (Implementation Plan §5, Schritt 4)
// Two layers, both PURE functions (state in -> new state + audited adjustments):
//   Layer 1  micro-calibration  — fires on every session_logs insert
//   Layer 2  macro-guardrails    — nightly (ACWR, auto-deload, rebase, rehab)
// Every action carries a one-sentence, user-facing reason (PP1 transparency).
// ============================================================================

import type {
  AthleteProfile,
  AthleteState,
  PaceZones,
  SessionType,
  Station,
} from "./types";
import { TIER_MIN, TIER_MAX, DEFAULT_TUNING, type EngineTuning } from "./constants";
import { predictRaceTime, type BenchmarkSample } from "./prognosis";

export interface AdjustmentRecord {
  layer: "micro" | "macro";
  trigger:
    | "session_logged"
    | "missed_session"
    | "pause"
    | "acwr_high"
    | "acwr_low"
    | "rpe_trend"
    | "manual_move"
    | "injury_flag"
    | "benchmark_result";
  action_taken: Record<string, unknown>;
  reason: string;
}

// ── Load model ──────────────────────────────────────────────────────────────

export interface LoadEntry {
  at: string | Date;
  srpe: number; // rpe_actual * duration_actual_min
}

export interface LoadState {
  acute_load_7d: number;
  chronic_load_28d: number;
  acwr: number;
}

const DAY = 86_400_000;

export function computeLoadState(history: LoadEntry[], now: Date = new Date()): LoadState {
  const ms = (d: string | Date) => new Date(d).getTime();
  const t = now.getTime();

  const acute = history
    .filter((e) => t - ms(e.at) < 7 * DAY)
    .reduce((s, e) => s + e.srpe, 0);
  const last28 = history
    .filter((e) => t - ms(e.at) < 28 * DAY)
    .reduce((s, e) => s + e.srpe, 0);
  const chronic = last28 / 4; // average weekly load over 28 days

  const acwr = chronic > 0 ? acute / chronic : acute > 0 ? 1.5 : 1.0;
  return {
    acute_load_7d: Math.round(acute),
    chronic_load_28d: Math.round(chronic),
    acwr: Math.round(acwr * 100) / 100,
  };
}

// ── Layer 1: micro-calibration ──────────────────────────────────────────────

/**
 * The zone a session type runs at, when the session itself does not say.
 *
 * run_intervals is exactly why `paceZone` on MicroInput exists: the interval
 * catalogue spans threshold, VO₂max and race pace, and calibrating the interval
 * zone off a 25-minute LT2 block moves the wrong number in the wrong direction.
 */
const PACE_ZONE_FOR: Partial<Record<SessionType, keyof PaceZones>> = {
  run_easy: "easy_sec_km",
  run_intervals: "interval_sec_km",
  compromised_run: "race_sec_km",
  full_sim: "race_sec_km",
};

export interface MicroInput {
  state: AthleteState;
  profile: AthleteProfile;
  sessionType: SessionType;
  station?: Station | null; // for station_work
  rpeTarget: number;
  rpeActual: number;
  durationActualMin: number;
  /** delta (rpe_actual - target) of the previous logged session of this type. */
  previousSameTypeDelta?: number;
  /** optional logged / Strava run pace to pull the zone toward (capped ±3%/wk). */
  actualPaceSecKm?: number;
  /**
   * The zone this particular session was prescribed at, from the block the
   * engine recorded it on. Overrides the session type's default; absent when
   * the session names no single zone, and then no pace is calibrated at all.
   */
  paceZone?: keyof PaceZones | null;
  loadHistory: LoadEntry[]; // sRPE entries incl. the session just logged
  benchmarks?: BenchmarkSample[];
  now?: Date;
  /** Calibration overrides (Phase D2) — merged over DEFAULT_TUNING. */
  tuning?: Partial<EngineTuning>;
}

export interface MicroResult {
  state: AthleteState;
  adjustments: AdjustmentRecord[];
}

function clampTier(v: number): number {
  return Math.max(TIER_MIN, Math.min(TIER_MAX, v));
}

/**
 * Clamp a proposed pace-zone value to ±capPct of the WEEKLY reference snapshot
 * (A7). Multiple logs in one week share the same reference, so total drift
 * per week stays bounded — the per-log cap alone allowed ~12%/week at 4 logs.
 */
function capPaceToRef(refValue: number, proposed: number, capPct: number): number {
  const lo = Math.round(refValue * (1 - capPct));
  const hi = Math.round(refValue * (1 + capPct));
  return Math.max(lo, Math.min(hi, Math.round(proposed)));
}

export function microCalibrate(input: MicroInput): MicroResult {
  const {
    state,
    profile,
    sessionType,
    station,
    rpeTarget,
    rpeActual,
    durationActualMin,
    previousSameTypeDelta,
    paceZone,
    actualPaceSecKm,
    loadHistory,
    benchmarks = [],
    now = new Date(),
  } = input;

  const T: EngineTuning = { ...DEFAULT_TUNING, ...(input.tuning ?? {}) };
  const adjustments: AdjustmentRecord[] = [];
  const next: AthleteState = {
    ...state,
    pace_zones: { ...state.pace_zones },
    station_tiers: { ...state.station_tiers },
  };

  // 1) Load update (sRPE -> acute/chronic/ACWR).
  const load = computeLoadState(loadHistory, now);
  next.acute_load_7d = load.acute_load_7d;
  next.chronic_load_28d = load.chronic_load_28d;
  next.acwr = load.acwr;

  // Weekly pace reference (A7): renew the snapshot when it is missing or
  // older than the window; otherwise every log this week caps against it.
  const refStale =
    !state.pace_ref_at ||
    now.getTime() - new Date(state.pace_ref_at).getTime() >= T.pace_ref_window_days * DAY;
  const paceRef: PaceZones = refStale ? { ...state.pace_zones } : state.pace_zones_ref;
  next.pace_zones_ref = paceRef;
  next.pace_ref_at = refStale ? now.toISOString() : state.pace_ref_at;

  // 2) Goal calibration by session type. Delta = actual - target.
  const delta = rpeActual - rpeTarget;
  const tooEasyStreak =
    delta <= T.rpe_delta_up_threshold &&
    (previousSameTypeDelta ?? 0) <= T.rpe_delta_up_threshold; // needs 2 in a row
  const tooHard = delta >= T.rpe_delta_down_threshold; // immediate

  // Direction: +1 harder (up), -1 easier (down), 0 hold. One step only.
  const step = tooHard ? -1 : tooEasyStreak ? 1 : 0;

  // The session's own zone wins over its type's. `null` means the session names
  // no single zone (an alternation, a progression) — nothing gets calibrated
  // from it, because there is no one pace it was run at.
  const zoneKey = paceZone === null ? undefined : (paceZone ?? PACE_ZONE_FOR[sessionType]);

  if (step !== 0) {
    if (station && sessionType === "station_work") {
      const from = state.station_tiers[station] ?? 2;
      const to = clampTier(from + step);
      if (to !== from) {
        next.station_tiers[station] = to;
        adjustments.push({
          layer: "micro",
          trigger: "session_logged",
          action_taken: { type: step > 0 ? "tier_up" : "tier_down", station, from, to },
          reason:
            step > 0
              ? `${prettyStation(station)} stepped up to tier ${to} — the last sessions came in easier than planned.`
              : `${prettyStation(station)} eased to tier ${to} — the last session was harder than planned, so we back off before it costs you.`,
        });
      }
    } else if (zoneKey) {
      const from = state.pace_zones[zoneKey];
      // Up = faster = fewer seconds/km; capped to ±cap% of the weekly reference.
      const proposed = from + (step > 0 ? -T.pace_step_sec_km : T.pace_step_sec_km);
      const to = capPaceToRef(paceRef[zoneKey], proposed, T.pace_weekly_cap_pct);
      if (to !== from) {
        next.pace_zones[zoneKey] = to;
        adjustments.push({
          layer: "micro",
          trigger: "session_logged",
          action_taken: { type: step > 0 ? "pace_up" : "pace_down", zone: zoneKey, from, to },
          reason:
            step > 0
              ? `Your ${zoneLabel(zoneKey)} pace tightened to ${fmtPace(to)} — recent runs felt easy.`
              : `Your ${zoneLabel(zoneKey)} pace eased to ${fmtPace(to)} — the last run was harder than targeted.`,
        });
      }
    } else if (sessionType === "strength") {
      // A6: the modifier is persisted state and applied by fill.ts — the
      // shown reason now describes something that actually happens.
      const from = state.strength_modifier;
      const to =
        Math.round(
          Math.max(
            T.strength_modifier_min,
            Math.min(T.strength_modifier_max, from + step * T.strength_step),
          ) * 100,
        ) / 100;
      if (to !== from) {
        next.strength_modifier = to;
        adjustments.push({
          layer: "micro",
          trigger: "session_logged",
          action_taken: { type: step > 0 ? "load_up" : "load_down", from, to },
          reason:
            step > 0
              ? `Strength load stepped up to ×${to.toFixed(2)} — you're clearing the working sets comfortably.`
              : `Strength load eased to ×${to.toFixed(2)} — last session read harder than planned.`,
        });
      }
    }
  }

  // 3) Pace-zone update from an actual run pace (manual or Strava), capped to
  //    ±3% of the weekly reference (A7).
  if (actualPaceSecKm != null) {
    if (zoneKey) {
      const from = next.pace_zones[zoneKey];
      const to = capPaceToRef(paceRef[zoneKey], actualPaceSecKm, T.pace_weekly_cap_pct);
      if (to !== from) {
        next.pace_zones[zoneKey] = to;
        adjustments.push({
          layer: "micro",
          trigger: "session_logged",
          action_taken: { type: "pace_recalibrate", zone: zoneKey, from, to },
          reason: `${zoneLabel(zoneKey)} pace recalibrated to ${fmtPace(to)} from your actual run (capped to a safe weekly step).`,
        });
      }
    }
  }

  // 4) Prognosis update.
  const predicted = predictRaceTime(profile, next, benchmarks);
  const prevPredicted = state.predicted_race_time_sec;
  next.predicted_race_time_sec = predicted;
  if (prevPredicted != null && prevPredicted !== predicted) {
    adjustments.push({
      layer: "micro",
      trigger: "session_logged",
      action_taken: { type: "prognosis", from: prevPredicted, to: predicted },
      reason: `Estimated finish time is now ${fmtDur(predicted)} (${predicted <= prevPredicted ? "-" : "+"}${fmtDur(Math.abs(predicted - prevPredicted))} vs. before).`,
    });
  }

  return { state: next, adjustments };
}

// ── Layer 2: macro-guardrails ───────────────────────────────────────────────

export interface MacroInput {
  state: AthleteState;
  avgRpe14d: number | null;
  daysSinceLastSession: number;
  injuryFlag: boolean;
  planStatus: string;
  /** Calibration overrides (Phase D2) — merged over DEFAULT_TUNING. */
  tuning?: Partial<EngineTuning>;
}

export type MacroDirective =
  | { type: "trim_week"; multiplier: number }
  | { type: "auto_deload" }
  | { type: "ramp_up"; weeks: number }
  | { type: "rebase" }
  | { type: "rehab" }
  | { type: "none" };

export interface MacroResult {
  directives: MacroDirective[];
  adjustments: AdjustmentRecord[];
}

export function macroGuardrails(input: MacroInput): MacroResult {
  const { state, avgRpe14d, daysSinceLastSession, injuryFlag, planStatus } = input;
  const T: EngineTuning = { ...DEFAULT_TUNING, ...(input.tuning ?? {}) };
  const directives: MacroDirective[] = [];
  const adjustments: AdjustmentRecord[] = [];

  // Injury takes precedence over everything.
  if (injuryFlag && planStatus !== "rehab") {
    directives.push({ type: "rehab" });
    adjustments.push({
      layer: "macro",
      trigger: "injury_flag",
      action_taken: { type: "rehab_mode" },
      reason: `Injury flagged — switching to a low-impact rehab block instead of stopping the plan. We rebuild when you reactivate.`,
    });
    return { directives, adjustments };
  }

  // Long inactivity -> rebase from today.
  if (daysSinceLastSession >= T.inactive_rebase_days) {
    directives.push({ type: "rebase" });
    adjustments.push({
      layer: "macro",
      trigger: "pause",
      action_taken: { type: "rebase", days_inactive: daysSinceLastSession },
      reason: `${daysSinceLastSession} days without a session — this week is rebuilt as a gentle re-entry and the phase plan re-times from today. A missed block is not a broken plan.`,
    });
    return { directives, adjustments };
  }

  // ACWR + sustained strain guardrails.
  const highStrain = avgRpe14d != null && avgRpe14d >= T.rpe_high_14d;
  if (state.acwr > T.acwr_hard || highStrain) {
    directives.push({ type: "auto_deload" });
    adjustments.push({
      layer: "macro",
      trigger: state.acwr > T.acwr_hard ? "acwr_high" : "rpe_trend",
      action_taken: { type: "auto_deload", acwr: state.acwr, avg_rpe_14d: avgRpe14d },
      reason:
        state.acwr > T.acwr_hard
          ? `Training load spiked (ACWR ${state.acwr} > ${T.acwr_hard}) — next week becomes a deload so you absorb the work instead of digging a hole.`
          : `Your average effort has sat very high (${avgRpe14d?.toFixed(1)}/10 over 14 days) — inserting a deload to protect adaptation.`,
    });
  } else if (state.acwr > T.acwr_soft) {
    directives.push({ type: "trim_week", multiplier: T.acwr_soft_trim });
    adjustments.push({
      layer: "macro",
      trigger: "acwr_high",
      action_taken: { type: "trim_week", acwr: state.acwr, multiplier: T.acwr_soft_trim },
      reason: `Load is running a little hot (ACWR ${state.acwr}) — trimming the rest of this week ~15% to keep you on the right side of the ramp.`,
    });
  } else if (state.acwr < T.acwr_low && daysSinceLastSession >= 3) {
    directives.push({ type: "ramp_up", weeks: 2 });
    adjustments.push({
      layer: "macro",
      trigger: "acwr_low",
      action_taken: { type: "ramp_up", acwr: state.acwr },
      reason: `Load has dropped off (ACWR ${state.acwr}) — easing back in over two weeks rather than jumping straight to full volume.`,
    });
  }

  if (!directives.length) directives.push({ type: "none" });
  return { directives, adjustments };
}

// ── Formatting helpers (kept local so the engine has no UI dependency) ──────
function prettyStation(s: Station): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function zoneLabel(k: keyof PaceZones): string {
  return { easy_sec_km: "easy", tempo_sec_km: "tempo", interval_sec_km: "interval", race_sec_km: "race" }[k];
}
function fmtPace(secKm: number): string {
  const m = Math.floor(secKm / 60);
  const s = secKm % 60;
  return `${m}:${String(s).padStart(2, "0")}/km`;
}
function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
