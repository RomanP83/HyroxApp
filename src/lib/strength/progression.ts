// ============================================================================
// Double progression, as a suggestion.
//
// The athlete programmed the day; the app does the arithmetic they would do in
// the sheet anyway: clear the top of the rep range on every set, and the weight
// goes up next time. Miss the bottom twice, and it comes down.
//
// Nothing here writes anything. suggestLoad() returns a number and a sentence;
// the load only changes when the athlete accepts it (§ "Vorschlagen, nicht
// überschreiben"). That is what keeps this useful for someone who plans their
// own strength work.
// ============================================================================

export interface ExercisePlan {
  name: string;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  /** null = bodyweight; there is no load to suggest. */
  load_kg: number | null;
}

export interface LoggedSet {
  set_number: number;
  reps: number | null;
  load_kg: number | null;
}

export interface LoadSuggestion {
  load_kg: number;
  reason: string;
}

/**
 * Step size for the next jump. Small on dumbbells, bigger on a loaded bar —
 * the same reasoning a lifter applies when reaching for the next pair.
 */
export function loadIncrement(load: number): number {
  if (load < 20) return 1;
  if (load < 60) return 2.5;
  return 5;
}

function round(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * @param plan      the exercise as programmed
 * @param sessions  logged sets per session, most recent FIRST
 */
export function suggestLoad(plan: ExercisePlan, sessions: LoggedSet[][]): LoadSuggestion | null {
  if (plan.load_kg == null || plan.load_kg <= 0) return null; // bodyweight
  if (plan.rep_min == null || plan.rep_max == null) return null; // open-ended
  const latest = (sessions[0] ?? []).filter((s) => typeof s.reps === "number");
  if (!latest.length) return null;

  const reps = latest.map((s) => s.reps as number);
  // Only judge a session that was actually carried out at the planned load;
  // a set done lighter says nothing about the planned weight.
  const atPlannedLoad = latest.every(
    (s) => s.load_kg == null || Math.abs(s.load_kg - (plan.load_kg as number)) < 0.01,
  );
  if (!atPlannedLoad) return null;

  const clearedTop = reps.length >= plan.sets && reps.every((r) => r >= (plan.rep_max as number));
  if (clearedTop) {
    const next = round(plan.load_kg + loadIncrement(plan.load_kg));
    return {
      load_kg: next,
      reason: `Every set hit ${plan.rep_max} reps at ${plan.load_kg} kg — ${next} kg is the next step.`,
    };
  }

  // Coming down needs a second opinion: one bad day is a bad day.
  const missedBottom = (sets: LoggedSet[]) =>
    sets.some((s) => typeof s.reps === "number" && s.reps < (plan.rep_min as number));
  if (missedBottom(latest) && sessions[1]?.length && missedBottom(sessions[1])) {
    const next = round(Math.max(1, plan.load_kg * 0.95));
    if (next < plan.load_kg) {
      return {
        load_kg: next,
        reason: `Under ${plan.rep_min} reps two sessions running — ${next} kg puts you back inside the range.`,
      };
    }
  }

  return null;
}

/** Suggestions for a whole training day, keyed by exercise name. */
export function suggestForTemplate(
  exercises: ExercisePlan[],
  historyByExercise: Record<string, LoggedSet[][]>,
): Record<string, LoadSuggestion> {
  const out: Record<string, LoadSuggestion> = {};
  for (const exercise of exercises) {
    const suggestion = suggestLoad(exercise, historyByExercise[exercise.name] ?? []);
    if (suggestion) out[exercise.name] = suggestion;
  }
  return out;
}
