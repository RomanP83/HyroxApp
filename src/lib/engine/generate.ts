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
import { applyDayOverrides, distributeSlots } from "./micro";
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
  // Plan week W starts on monday(startDate) + (W-1)*7 — the same grid the race
  // calendar uses, and the anchor a stored override is keyed against.
  const weekMonday = (w: number): string | null => {
    if (!input.startDate) return null;
    const d = new Date(`${input.startDate.slice(0, 10)}T00:00:00.000Z`);
    const dow = d.getUTCDay();
    const monday = d.getTime() - (dow === 0 ? 6 : dow - 1) * 86_400_000;
    return new Date(monday + (w - 1) * 7 * 86_400_000).toISOString().slice(0, 10);
  };

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

  // Benchmark weeks (§5 Schritt 1): week 1, end of build, and one last test
  // before the race.
  //
  // That last one used to sit on the first taper week. With a two-week taper
  // that is two weeks out and reads exactly right. With a one-week taper it
  // IS race week — an all-out test seven days before the start, which is a
  // stress and not a rehearsal, and it took a slot the taper needed for its
  // own mix. So a short taper tests in the last peak week instead, stepping
  // back once more if that is the week carrying the full simulation: a test
  // and a complete run-through in one week is two race efforts in seven days.
  const benchmarkWeeks = new Set<number>([1]);
  if (lastBuild) benchmarkWeeks.add(lastBuild.end_week);
  if (taper) {
    const taperWeeks = taper.end_week - taper.start_week + 1;
    let preRace = taperWeeks > 1 ? taper.start_week : taper.start_week - 1;
    if (preRace === fullSimWeek) preRace -= 1;
    if (preRace >= 1) benchmarkWeeks.add(preRace);
  }

  // Deload weeks: every fourth week, right through the peak block — the
  // recovery week is not a base-and-build luxury, and restricting it there is
  // how a 12-week plan ended up with one deload and eight straight loading
  // weeks after it. Two weeks are never a deload: a test week (you want to be
  // fresh for it, not trimmed) and the simulation week (it is the load). When
  // the fourth week is one of those the deload moves a week earlier and the
  // cadence continues from there, so the gap stays 3-4 weeks rather than
  // silently becoming 8. The taper needs none: it is the reduction.
  const deloadLimit = taper ? taper.start_week - 2 : weeksToRace;
  const deloadWeeks = new Set<number>();
  for (let next = 4; next <= deloadLimit; ) {
    let target = next;
    while (target > 1 && (benchmarkWeeks.has(target) || target === fullSimWeek)) target--;
    if (target > 1 && target <= deloadLimit) deloadWeeks.add(target);
    next = target + 4;
  }

  const phases: GeneratedPhase[] = phasePlans.map((pp) => {
    const weeks: GeneratedWeek[] = [];
    for (let w = pp.start_week; w <= pp.end_week; w++) {
      const weekInPhase = w - pp.start_week + 1;
      const isBenchmark = benchmarkWeeks.has(w);
      const isDeload = deloadWeeks.has(w);

      let slots = distributeSlots({
        phase: pp.phase_type,
        level: profile.experience_level,
        weeksInPhase: pp.end_week - pp.start_week + 1,
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
          doubleDays: profile.preferred_double_days ?? null,
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

      // What the athlete moved by hand comes back first; the race calendar then
      // bends the result, because a race day is a fact and a preference is not.
      const monday = weekMonday(w);
      if (monday && input.dayOverrides?.length) {
        slots = applyDayOverrides(
          slots,
          input.dayOverrides.filter((o) => o.week_start.slice(0, 10) === monday),
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
