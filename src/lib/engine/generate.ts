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
import {
  applyRacesToWeek,
  placeRaces,
  raceNotesForWeek,
  raceVolumeMultiplier,
  type RaceDayPlacement,
} from "./raceCalendar";
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
  race_day: "Race Day",
  rest: "Rest",
};

export function generatePlan(input: GenerateInput): GeneratedPlan {
  const { profile, state, library, weeksToRace } = input;

  // The race calendar, resolved onto the plan grid. Without a start date there
  // is nothing to resolve dates against, so the plan stays calendar-free —
  // which is exactly how it behaved before the calendar existed.
  const placements: RaceDayPlacement[] =
    input.startDate && input.races?.length
      ? placeRaces({ startDate: input.startDate, weeksToRace, races: input.races })
      : [];
  const phasePlans = buildPhasePlan(weeksToRace);
  const lastBuild = [...phasePlans].reverse().find((p) => p.phase_type === "build");
  const taper = phasePlans.find((p) => p.phase_type === "taper");
  const peak = phasePlans.find((p) => p.phase_type === "peak");

  // ONE full race simulation per cycle, not one per peak week: a complete
  // run-through costs 2-3 days of recovery. It goes three weeks out — late
  // enough to rehearse pacing, early enough to absorb.
  const fullSimWeek = peak
    ? Math.min(peak.end_week, Math.max(peak.start_week, weeksToRace - 2))
    : null;

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
        includeFullSim: w === fullSimWeek,
        prefs: {
          longRunDay: profile.preferred_long_run_day ?? null,
          strengthDays: profile.preferred_strength_days ?? null,
          restDays: profile.preferred_rest_days ?? null,
        },
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
          }) * raceVolumeMultiplier(w, placements),
        );
      }

      // A race in the calendar takes its day, eases the days in front of it and
      // turns the days behind it into recovery — across the week boundary too.
      slots = applyRacesToWeek(slots, w, placements);
      const weekRaces = placements.filter((p) => p.week_number === w);

      const sessions = slots.map((slot) => ({
        day_hint: slot.day_hint,
        day_slot: slot.day_slot,
        session_type: slot.session_type,
        title:
          slot.session_type === "race_day"
            ? (weekRaces.find((p) => p.day_hint === slot.day_hint)?.race.type ?? "Race Day")
            : (SESSION_TITLES[slot.session_type] ?? slot.session_type),
        planned_duration_min: slot.planned_duration_min,
        intensity_rpe_target: slot.intensity_rpe_target,
        sort_order: slot.sort_order,
        blocks: fillSession(slot, profile, state, library, w, pp.phase_type),
      }));

      weeks.push({
        week_number: w,
        is_deload: isDeload,
        is_benchmark_week: isBenchmark,
        races: weekRaces.length
          ? weekRaces.map((p) => ({
              date: p.race.date,
              type: p.race.type,
              priority: p.race.priority,
              day_hint: p.day_hint,
            }))
          : undefined,
        weekly_goal:
          raceNotesForWeek(w, placements)[0] ??
          weeklyGoal({
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
