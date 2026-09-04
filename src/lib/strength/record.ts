// ============================================================================
// Server glue for logged strength sets.
//
// Writes what actually happened (set by set), then asks the pure progression
// module whether the next session deserves a different weight. The answer is
// parked on the exercise as a SUGGESTION — never written into load_kg. The
// athlete accepts it on /strength, or ignores it and keeps their number.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { suggestLoad, type LoggedSet } from "./progression";

export interface StrengthSetInput {
  exercise_id?: string | null;
  exercise_name: string;
  set_number: number;
  reps?: number | null;
  load_kg?: number | null;
}

export interface StrengthRecordOutcome {
  sets: number;
  suggestions: { exercise: string; from: number | null; to: number; reason: string }[];
}

/** Refresh progression suggestions after the set rows have been committed. */
export async function refreshStrengthSuggestions(
  supabase: SupabaseClient,
  exerciseIds: string[],
): Promise<StrengthRecordOutcome["suggestions"]> {
  const suggestions: StrengthRecordOutcome["suggestions"] = [];
  const uniqueIds = [...new Set(exerciseIds.filter(Boolean))];
  if (!uniqueIds.length) return suggestions;

  const { data: exercises, error } = await supabase
    .from("strength_exercises")
    .select("id, name, sets, rep_min, rep_max, load_kg")
    .in("id", uniqueIds);
  if (error) throw new Error(`strength exercises: ${error.message}`);

  for (const exercise of exercises ?? []) {
    const { data: history, error: historyError } = await supabase
      .from("strength_set_logs")
      .select("session_id, set_number, reps, load_kg, logged_at")
      .eq("exercise_id", exercise.id)
      .order("logged_at", { ascending: false })
      .limit(40);
    if (historyError) throw new Error(`strength history: ${historyError.message}`);

    const bySession = new Map<string, LoggedSet[]>();
    for (const row of history ?? []) {
      const list = bySession.get(row.session_id) ?? [];
      list.push({
        set_number: row.set_number,
        reps: row.reps,
        load_kg: row.load_kg == null ? null : Number(row.load_kg),
      });
      bySession.set(row.session_id, list);
    }
    const sessionsNewestFirst = [...bySession.values()].map((list) =>
      [...list].sort((a, b) => a.set_number - b.set_number),
    );
    const plan = {
      name: exercise.name,
      sets: exercise.sets,
      rep_min: exercise.rep_min,
      rep_max: exercise.rep_max,
      load_kg: exercise.load_kg == null ? null : Number(exercise.load_kg),
    };
    const suggestion = suggestLoad(plan, sessionsNewestFirst);
    if (!suggestion) continue;

    const { error: updateError } = await supabase
      .from("strength_exercises")
      .update({
        suggested_load_kg: suggestion.load_kg,
        suggested_reason: suggestion.reason,
        suggested_at: new Date().toISOString(),
      })
      .eq("id", exercise.id);
    if (updateError) throw new Error(`strength suggestion: ${updateError.message}`);
    suggestions.push({
      exercise: exercise.name,
      from: plan.load_kg,
      to: suggestion.load_kg,
      reason: suggestion.reason,
    });
  }
  return suggestions;
}

/** Persist the sets of one logged session and refresh the suggestions. */
export async function recordStrengthSets(
  supabase: SupabaseClient,
  sessionId: string,
  sets: StrengthSetInput[],
): Promise<StrengthRecordOutcome> {
  const rows = sets
    .filter((s) => s.exercise_name.trim() && (s.reps != null || s.load_kg != null))
    .map((s) => ({
      session_id: sessionId,
      exercise_id: s.exercise_id ?? null,
      exercise_name: s.exercise_name.trim(),
      set_number: s.set_number,
      reps: s.reps ?? null,
      load_kg: s.load_kg ?? null,
      logged_at: new Date().toISOString(),
    }));
  if (!rows.length) return { sets: 0, suggestions: [] };

  const { error } = await supabase
    .from("strength_set_logs")
    .upsert(rows, { onConflict: "session_id,exercise_name,set_number" });
  if (error) throw new Error(`strength sets: ${error.message}`);

  const exerciseIds = [...new Set(rows.map((r) => r.exercise_id).filter((id): id is string => !!id))];
  const suggestions = await refreshStrengthSuggestions(supabase, exerciseIds);
  return { sets: rows.length, suggestions };
}
