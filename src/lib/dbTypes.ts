// ============================================================================
// Typed row shapes for the Supabase joins we use (Roadmap B8).
// Hand-maintained until `supabase gen types typescript` runs in CI against a
// live instance — these mirror supabase/migrations/0001+. Replacing the `as
// any` casts with these keeps join drift visible at compile time.
// ============================================================================
import type { AthleteState, PaceZones, SessionType } from "@/lib/engine";

export interface AthleteStateRow {
  profile_id: string;
  acute_load_7d: number | string;
  chronic_load_28d: number | string;
  acwr: number | string;
  pace_zones: PaceZones;
  station_tiers: Record<string, number>;
  measured_station_seconds?: Record<string, number> | null;
  predicted_race_time_sec: number | null;
  strength_modifier?: number | string | null;
  pace_zones_ref?: PaceZones | null;
  pace_ref_at?: string | null;
}

/** Map a raw athlete_state row (numerics may arrive as strings) to engine state. */
export function stateFromRow(row: AthleteStateRow): AthleteState {
  return {
    acute_load_7d: Number(row.acute_load_7d),
    chronic_load_28d: Number(row.chronic_load_28d),
    acwr: Number(row.acwr),
    pace_zones: row.pace_zones,
    station_tiers: row.station_tiers,
    measured_station_seconds:
      row.measured_station_seconds && Object.keys(row.measured_station_seconds).length
        ? row.measured_station_seconds
        : undefined,
    predicted_race_time_sec: row.predicted_race_time_sec,
    strength_modifier: Number(row.strength_modifier ?? 1),
    pace_zones_ref:
      row.pace_zones_ref && Object.keys(row.pace_zones_ref).length
        ? row.pace_zones_ref
        : row.pace_zones,
    pace_ref_at: row.pace_ref_at ?? null,
  };
}

export interface SessionWithWeekRow {
  id: string;
  session_type: SessionType;
  plan_id: string;
  intensity_rpe_target: number;
  planned_duration_min: number;
  plan_weeks: { week_number: number };
}

export interface LogWithSessionRow {
  completed_at: string;
  rpe_actual: number | null;
  duration_actual_min: number | null;
  session_id: string;
  sessions: {
    session_type: SessionType;
    intensity_rpe_target: number;
    plan_id: string;
  };
}

export interface SessionBlockJoinRow {
  sort_order: number;
  block_id: string;
  load_adjustments: Record<string, unknown> | null;
  workout_blocks: {
    slug: string | null;
    block_type: string;
    station: string | null;
    content: unknown[];
  } | null;
}

export interface RaceRow {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  event_date: string;
}

/**
 * Parse a `session_logs.state_before` snapshot (jsonb) back into engine state.
 * The snapshot is written by applyMicroForSession() as a plain AthleteState;
 * anything older (logged before the reset feature shipped) yields null, which
 * the reset path treats as "cannot roll the fitness state back".
 */
export function stateFromSnapshot(value: unknown): AthleteState | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.acwr !== "number" || typeof v.pace_zones !== "object" || v.pace_zones === null) {
    return null;
  }
  return {
    acute_load_7d: Number(v.acute_load_7d ?? 0),
    chronic_load_28d: Number(v.chronic_load_28d ?? 0),
    acwr: Number(v.acwr),
    pace_zones: v.pace_zones as PaceZones,
    station_tiers: (v.station_tiers ?? {}) as Record<string, number>,
    predicted_race_time_sec:
      typeof v.predicted_race_time_sec === "number" ? v.predicted_race_time_sec : null,
    strength_modifier: Number(v.strength_modifier ?? 1),
    pace_zones_ref: (v.pace_zones_ref ?? v.pace_zones) as PaceZones,
    pace_ref_at: typeof v.pace_ref_at === "string" ? v.pace_ref_at : null,
  };
}
