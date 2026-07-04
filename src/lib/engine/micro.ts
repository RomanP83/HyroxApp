// ============================================================================
// Micro layer (Implementation Plan §5, Schritt 2)
// Distribute session slots across the week by training_days_per_week and a
// per-phase priority order. Compromised-running frequency ramps base->peak.
// ============================================================================

import type { PhaseType, SessionType } from "./types";
import {
  PHASE_SLOT_PRIORITY,
  PHASE_RPE_TARGET,
  COMPROMISED_PER_WEEK,
} from "./constants";

export interface SessionSlot {
  session_type: SessionType;
  day_hint: number; // 1..7
  intensity_rpe_target: number; // 1..10
  planned_duration_min: number;
  sort_order: number;
}

const BASE_DURATION: Record<SessionType, number> = {
  run_easy: 45,
  run_intervals: 55,
  compromised_run: 60,
  strength: 60,
  station_work: 50,
  full_sim: 90,
  mobility: 30,
  benchmark: 45,
  rest: 0,
};

const RPE_OFFSET: Record<SessionType, number> = {
  run_easy: -2,
  run_intervals: 1,
  compromised_run: 1,
  strength: 0,
  station_work: 0,
  full_sim: 2,
  mobility: -3,
  benchmark: 2,
  rest: -5,
};

function clampRpe(v: number): number {
  return Math.max(1, Math.min(10, v));
}

/** Evenly spread N sessions across a 7-day week, hard days not back-to-back. */
function spreadDays(count: number): number[] {
  if (count <= 0) return [];
  if (count >= 7) return [1, 2, 3, 4, 5, 6, 7].slice(0, count);
  const days: number[] = [];
  const step = 7 / count;
  for (let i = 0; i < count; i++) {
    days.push(Math.min(7, Math.round(i * step) + 1));
  }
  // de-duplicate while keeping order
  const seen = new Set<number>();
  return days.map((d) => {
    let day = d;
    while (seen.has(day) && day < 7) day++;
    seen.add(day);
    return day;
  });
}

interface DistributeInput {
  phase: PhaseType;
  trainingDays: number; // 3..6
  weekInPhase: number; // 1-based
  isDeload: boolean;
  isBenchmark: boolean;
}

/**
 * Decide the ordered list of session types for one week, then attach day hints,
 * durations and RPE targets. Deterministic given the inputs.
 */
export function distributeSlots(input: DistributeInput): SessionSlot[] {
  const { phase, trainingDays, weekInPhase, isDeload, isBenchmark } = input;
  const priority = PHASE_SLOT_PRIORITY[phase];

  let types = priority.slice(0, trainingDays);

  // Compromised-running ramp (§5 Schritt 2). In base it is only every 2nd week;
  // when it is an "off" week, fall back to the next non-selected priority slot.
  const perWeek = COMPROMISED_PER_WEEK[phase];
  if (perWeek < 1) {
    const wantThisWeek = weekInPhase % 2 === 0; // every 2nd week
    if (!wantThisWeek) {
      const fallback = priority.find((t) => !types.includes(t)) ?? "run_easy";
      types = types.map((t) => (t === "compromised_run" ? fallback : t));
    }
  }

  // Benchmark week: front-load a benchmark session, drop the lowest slot.
  if (isBenchmark) {
    types = ["benchmark", ...types.slice(0, Math.max(2, trainingDays - 1))];
  }

  // Deload: shed the lowest-priority slot (keep at least 3 touches).
  if (isDeload && types.length > 3) {
    types = types.slice(0, types.length - 1);
  }

  const days = spreadDays(types.length);

  return types.map((session_type, i) => {
    let rpe = PHASE_RPE_TARGET[phase] + RPE_OFFSET[session_type];
    if (isDeload) rpe -= 2;
    return {
      session_type,
      day_hint: days[i] ?? i + 1,
      intensity_rpe_target: clampRpe(rpe),
      planned_duration_min: isDeload
        ? Math.round(BASE_DURATION[session_type] * 0.7)
        : BASE_DURATION[session_type],
      sort_order: i,
    };
  });
}
