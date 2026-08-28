// ============================================================================
// Macro layer (Implementation Plan §5, Schritt 1)
// weeks_to_race -> phase split via lookup + interpolation.
// Handles "krumme Zeiträume" (e.g. 9, 11, 14 weeks) which is exactly where
// pure-template competitors break (§5 Contra).
// ============================================================================

import type { PhaseType, TransitionModule } from "./types";
import {
  OFFSEASON_DELOAD_EVERY,
  PHASE_SPLIT_TABLE,
  PHASE_VOLUME_MULTIPLIER,
  PLAN_MAX_WEEKS,
  RACE_BLOCK_WEEKS,
  TRANSITION_MODULES,
  TRANSITION_ORDER,
} from "./constants";

export interface PhaseSplit {
  phase_type: PhaseType;
  weeks: number;
}

const PHASE_ORDER: PhaseType[] = ["base", "build", "peak", "taper"];

const FOCUS: Record<PhaseType, string> = {
  base: "Aerobic base, movement quality and station technique at controlled intensity.",
  build: "Race-specific intensity: compromised running and heavier station work.",
  peak: "Sharpen with full simulations and race-pace efforts; volume plateaus, intensity peaks.",
  taper: "Cut volume, keep intensity crisp. Arrive fresh — taper is never negotiable.",
};

/**
 * Split total weeks into [base, build, peak, taper].
 * Guarantees: integers summing to weeksToRace, taper == 1 (when weeks >= 3),
 * peak >= 2 when there is room. Taper is protected first (PP4).
 */
export function splitPhases(weeksToRace: number): PhaseSplit[] {
  const w = Math.max(1, Math.floor(weeksToRace));
  let base = 0;
  let build = 0;
  let peak = 0;
  let taper = 0;

  if (w <= 2) {
    // Almost no runway: everything is effectively taper/sharpening.
    taper = w;
  } else if (w < 8) {
    // §5: "< 8" row — base 0–1, rest build, peak 2, taper 1.
    taper = 1;
    peak = Math.min(2, w - taper - 1);
    base = w >= 6 ? 1 : 0;
    build = w - taper - peak - base;
  } else if (PHASE_SPLIT_TABLE[w]) {
    [base, build, peak, taper] = PHASE_SPLIT_TABLE[w];
  } else {
    // Interpolate between the nearest tabulated anchors.
    const anchors = Object.keys(PHASE_SPLIT_TABLE)
      .map(Number)
      .sort((a, b) => a - b);
    let raw: [number, number, number, number];
    if (w > anchors[anchors.length - 1]) {
      // Beyond 16: keep the 16-week shape, add the surplus to base.
      const top = PHASE_SPLIT_TABLE[anchors[anchors.length - 1]];
      raw = [top[0] + (w - anchors[anchors.length - 1]), top[1], top[2], top[3]];
    } else {
      let lo = anchors[0];
      let hi = anchors[anchors.length - 1];
      for (let i = 0; i < anchors.length - 1; i++) {
        if (w >= anchors[i] && w <= anchors[i + 1]) {
          lo = anchors[i];
          hi = anchors[i + 1];
          break;
        }
      }
      const t = (w - lo) / (hi - lo);
      const a = PHASE_SPLIT_TABLE[lo];
      const b = PHASE_SPLIT_TABLE[hi];
      raw = [0, 1, 2, 3].map((i) => a[i] + (b[i] - a[i]) * t) as unknown as [
        number,
        number,
        number,
        number,
      ];
    }

    // Normalise to integers summing to w with taper protected then peak.
    taper = 1;
    peak = Math.min(Math.max(2, Math.round(raw[2])), w - taper - 1);
    const remaining = w - taper - peak;
    // Preserve base:build ratio from the interpolated values.
    const ratioBase = raw[0] / Math.max(0.0001, raw[0] + raw[1]);
    base = Math.round(remaining * ratioBase);
    build = remaining - base;
    if (build < 1 && remaining >= 1) {
      build = 1;
      base = remaining - 1;
    }
  }

  const result: PhaseSplit[] = (
    [
      { phase_type: "base" as PhaseType, weeks: base },
      { phase_type: "build" as PhaseType, weeks: build },
      { phase_type: "peak" as PhaseType, weeks: peak },
      { phase_type: "taper" as PhaseType, weeks: taper },
    ] satisfies PhaseSplit[]
  ).filter((p) => p.weeks > 0);

  // Sanity: never lose or invent a week.
  const sum = result.reduce((acc, p) => acc + p.weeks, 0);
  if (sum !== w && result.length > 0) {
    result[result.length - 2 >= 0 ? result.length - 2 : 0].weeks += w - sum;
  }
  return result;
}

export interface PhasePlan {
  phase_type: PhaseType;
  sort_order: number;
  start_week: number; // plan-global, 1-based
  end_week: number;
  volume_multiplier: number;
  focus_description: string;
}

/** Expand the split into concrete phase blocks with global week ranges. */
export function buildPhasePlan(weeksToRace: number): PhasePlan[] {
  const splits = splitPhases(weeksToRace);
  const phases: PhasePlan[] = [];
  let cursor = 1;
  splits
    .sort((a, b) => PHASE_ORDER.indexOf(a.phase_type) - PHASE_ORDER.indexOf(b.phase_type))
    .forEach((s, idx) => {
      const start = cursor;
      const end = cursor + s.weeks - 1;
      phases.push({
        phase_type: s.phase_type,
        sort_order: idx,
        start_week: start,
        end_week: end,
        volume_multiplier: PHASE_VOLUME_MULTIPLIER[s.phase_type],
        focus_description: FOCUS[s.phase_type],
      });
      cursor = end + 1;
    });
  return phases;
}

/**
 * A block with no race in front of it.
 *
 * After a race — or between goals — there is nothing to periodise towards, and
 * pretending otherwise is what produced a two-week taper aimed at a date in the
 * past. What belongs here is four modules that build on each other: complete
 * recovery, a gentle re-introduction, volume back to normal, and then an
 * off-season for as long as there is room for one.
 *
 * It stays phase_type "base" rather than earning a phase of its own: every
 * catalogue, mix row and pace target in the engine is keyed on the four race
 * phases. What makes it a transition is which module each week runs
 * (transitionModuleFor) and the load that module carries.
 */
export function transitionPhasePlan(weeks: number): PhasePlan[] {
  const span = Math.max(1, Math.floor(weeks));
  return [
    {
      phase_type: "base",
      sort_order: 0,
      start_week: 1,
      end_week: span,
      volume_multiplier: TRANSITION_MODULES.offseason.volume,
      focus_description:
        "Between goals: recover, rebuild the capacity, then spend the room that is left on the weaknesses the race exposed. Pick your next race whenever you are ready — the plan rebuilds around it.",
    },
  ];
}

/**
 * Which module a given week of a transition block runs.
 *
 * The first three weeks are one module each; everything after them is the
 * off-season. A block too short for all four simply stops where it stops — two
 * weeks is reset and re-introduction, and the race block picks up from there.
 */
export function transitionModuleFor(
  week: number,
  /**
   * Where the block starts. A block that CONTINUES one — no race in the
   * calendar, the last one simply ran out — starts at the off-season: the
   * three days of nothing belong after a race, not after a loading cycle.
   */
  firstModule: TransitionModule = "reset",
): TransitionModule {
  const w = Math.max(1, Math.floor(week));
  const from = TRANSITION_ORDER.indexOf(firstModule);
  return TRANSITION_ORDER[Math.min(from + w - 1, TRANSITION_ORDER.length - 1)];
}

/**
 * Off-season weeks run in four-week cycles: three loading, one at -40%. The
 * count starts when the off-season does, not when the block does, so the
 * deload never lands on the first off-season week.
 */
export function transitionIsDeload(
  week: number,
  firstModule: TransitionModule = "reset",
): boolean {
  const offseasonStart =
    TRANSITION_ORDER.indexOf("offseason") - TRANSITION_ORDER.indexOf(firstModule) + 1;
  if (week < offseasonStart) return false;
  return (week - offseasonStart + 1) % OFFSEASON_DELOAD_EVERY === 0;
}

/**
 * How long a transition block should run, given the weeks to the next race.
 *
 * The race block wants its full runway (RACE_BLOCK_WEEKS); everything before
 * that is where the off-season stretches. With little room the block collapses
 * to its first modules and the race block starts almost immediately — but
 * never to nothing, because the week after a race is a reset whatever else is
 * true.
 */
/**
 * Does a race fit inside a race block, or is it still too far to periodise for?
 *
 * A race cycle ends in a peak and a taper, and both are promises about a date.
 * Built for a race twenty months out, the plan was simply truncated to
 * PLAN_MAX_WEEKS and tapered at the end of it — which put the taper forty weeks
 * before the race it was tapering into. Everything beyond the block's own
 * length is transition work: base volume with nothing to taper into, and the
 * race block starts when the race is actually in range.
 */
export function raceBlockFits(weeksToRace: number | null): boolean {
  return weeksToRace != null && weeksToRace <= PLAN_MAX_WEEKS;
}

export function transitionWeeksFor(weeksToNextRace: number | null): number {
  // No race in the calendar: the block has no end anyone has worked out, so it
  // runs as far as the plan format goes. Four weeks would cut the off-season —
  // the one module meant to stretch — off after a single week, and hand the
  // athlete a fresh three-day reset every month.
  if (weeksToNextRace == null) return PLAN_MAX_WEEKS;
  return Math.max(1, Math.min(PLAN_MAX_WEEKS, weeksToNextRace - RACE_BLOCK_WEEKS));
}
