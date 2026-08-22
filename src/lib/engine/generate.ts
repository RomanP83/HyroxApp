// ============================================================================
// Plan generation orchestrator (Implementation Plan §5, Schritte 1–3)
// Macro split -> weeks (deload/benchmark placement) -> micro slots -> fill.
// Pure & deterministic: same input -> same plan. This is what makes adaptation
// testable and explainable ("lazy AI" is the competitor's flaw, PP1).
// ============================================================================

import type { GenerateInput, GeneratedPlan, GeneratedPhase, GeneratedWeek } from "./types";
import { ENGINE_VERSION, DELOAD_VOLUME_MULTIPLIER } from "./constants";
import { buildPhasePlan } from "./macro";
import { scaleRunDurations, weeklyVolumeTarget } from "./running";
import { distributeSlots } from "./micro";
import { fillSession } from "./fill";
import { weeklyGoal } from "./weeklyGoal";

const SESSION_TITLES: Record<string, string> = {
  long_run: "Long Run (Zone 2)",
  run_easy: "Recovery Run (Zone 1-2)",
  run_intervals: "Threshold / VO₂max Intervals",
  compromised_run: "Compromised Running",
  strength: "Strength",
  station_work: "Station Work",
  full_sim: "Race Simulation",
  mobility: "Mobility & Recovery",
  benchmark: "Benchmark Test",
  rest: "Rest",
};

export function generatePlan(input: GenerateInput): GeneratedPlan {
  const { profile, state, library, weeksToRace } = input;
  const phasePlans = buildPhasePlan(weeksToRace);
  const lastBuild = [...phasePlans].reverse().find((p) => p.phase_type === "build");
  const taper = phasePlans.find((p) => p.phase_type === "taper");

  // Benchmark weeks (§5 Schritt 1): week 1, end of build, start of taper.
  const benchmarkWeeks = new Set<number>([1]);
  if (lastBuild) benchmarkWeeks.add(lastBuild.end_week);
  if (taper) benchmarkWeeks.add(taper.start_week);

  const phases: GeneratedPhase[] = phasePlans.map((pp) => {
    const weeks: GeneratedWeek[] = [];
    for (let w = pp.start_week; w <= pp.end_week; w++) {
      const weekInPhase = w - pp.start_week + 1;
      const isBenchmark = benchmarkWeeks.has(w);
      // Deload: every 4th week within base/build, unless it's a benchmark week.
      const isDeload =
        !isBenchmark && (pp.phase_type === "base" || pp.phase_type === "build") && w % 4 === 0;

      let slots = distributeSlots({
        phase: pp.phase_type,
        trainingDays: profile.training_days_per_week,
        weekInPhase,
        isDeload,
        isBenchmark,
        doublesPerWeek: profile.doubles_per_week ?? 0,
        runsPerWeek: profile.runs_per_week ?? undefined,
      });

      // When the athlete gave the cycle a peak volume, the week's runs are
      // stretched or shrunk onto its share of it (running.ts holds the curve).
      if (profile.weekly_km_peak) {
        slots = scaleRunDurations(
          slots,
          state.pace_zones,
          weeklyVolumeTarget({
            peakKm: profile.weekly_km_peak,
            phase: pp.phase_type,
            isDeload,
            weekNumber: w,
          }),
        );
      }

      const sessions = slots.map((slot) => ({
        day_hint: slot.day_hint,
        day_slot: slot.day_slot,
        session_type: slot.session_type,
        title: SESSION_TITLES[slot.session_type] ?? slot.session_type,
        planned_duration_min: slot.planned_duration_min,
        intensity_rpe_target: slot.intensity_rpe_target,
        sort_order: slot.sort_order,
        blocks: fillSession(slot, profile, state, library, w, pp.phase_type),
      }));

      weeks.push({
        week_number: w,
        is_deload: isDeload,
        is_benchmark_week: isBenchmark,
        weekly_goal: weeklyGoal({
          phase: pp.phase_type,
          weekInPhase,
          phaseLength: pp.end_week - pp.start_week + 1,
          isDeload,
          isBenchmark,
          weeksToRace: weeksToRace - w + 1,
        }),
        target_sessions: sessions.length,
        sessions,
      });
    }

    return {
      phase_type: pp.phase_type,
      sort_order: pp.sort_order,
      start_week: pp.start_week,
      end_week: pp.end_week,
      focus_description: pp.focus_description,
      volume_multiplier: pp.volume_multiplier,
      weeks,
    };
  });

  return {
    total_weeks: weeksToRace,
    engine_version: ENGINE_VERSION,
    phases,
  };
}

export { DELOAD_VOLUME_MULTIPLIER };
