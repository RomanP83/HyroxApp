// ============================================================================
// Everything you have ever logged, as one object — the body of /api/export and
// of /api/hub/export (MyHealthHub pulls it). Built here once so both routes
// always send the same shape.
//
// Self-contained on purpose: the workout_blocks rows a session actually points
// at travel with it, so the file can be read on its own rather than only
// against a database that still has the same library seeded.
//
// Left out deliberately: the rest of the block library (regenerable from
// librarySeed.ts) and the knowledge pipeline — none of them are things you
// did, and all of them come back from the repo. The benchmark definitions
// travel along so a reader knows what each benchmark value measures.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkIds, idsOf } from "@/lib/exportChunks";

/**
 * `.in()` puts every id in the query string, so a few thousand sessions would
 * blow the URL length in year three. Chunked, and the chunks concatenated.
 */
async function selectIn(
  supabase: SupabaseClient,
  table: string,
  column: string,
  ids: string[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const batch of chunkIds(ids)) {
    const { data, error } = await supabase.from(table).select("*").in(column, batch);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as Record<string, unknown>[]));
  }
  return out;
}

/** The export (format 1) for one profile. Throws on any read error. */
export async function buildExportPayload(supabase: SupabaseClient, profile: Record<string, unknown> & { id: string }) {
  const byProfile = async (table: string) => selectIn(supabase, table, "profile_id", [profile.id]);

  const plans = await byProfile("plans");
  const planIds = idsOf(plans);
  const phases = await selectIn(supabase, "plan_phases", "plan_id", planIds);
  const weeks = await selectIn(supabase, "plan_weeks", "phase_id", idsOf(phases));
  const sessions = await selectIn(supabase, "sessions", "week_id", idsOf(weeks));
  const sessionIds = idsOf(sessions);
  const sessionBlocks = await selectIn(supabase, "session_blocks", "session_id", sessionIds);

  const seasons = await byProfile("seasons");
  const seasonIds = idsOf(seasons);
  const seasonRaces = await selectIn(supabase, "season_races", "season_id", seasonIds);
  // races is the shared race catalogue (no profile_id): export the races this
  // athlete's plans and seasons point at.
  const raceIds = [...new Set([...idsOf(plans, "race_id"), ...idsOf(seasonRaces, "race_id")])];
  const templates = await byProfile("strength_templates");
  const benchmarkResults = await byProfile("benchmark_results");

  return {
    exported_at: new Date().toISOString(),
    // Bumped when the shape changes, so an old file is still readable.
    format: 1 as const,
    athlete: { profile, state: (await byProfile("athlete_state"))[0] ?? null },
    season: {
      races: await selectIn(supabase, "races", "id", raceIds),
      seasons,
      season_races: seasonRaces,
      season_blocks: await selectIn(supabase, "season_blocks", "season_id", seasonIds),
    },
    training: {
      plans,
      plan_phases: phases,
      plan_weeks: weeks,
      sessions,
      session_blocks: sessionBlocks,
      // The blocks these sessions point at — without them the file describes
      // sessions whose content lives somewhere else.
      workout_blocks: await selectIn(supabase, "workout_blocks", "id", idsOf(sessionBlocks, "block_id")),
      session_logs: await selectIn(supabase, "session_logs", "session_id", sessionIds),
      plan_adjustments: await selectIn(supabase, "plan_adjustments", "plan_id", planIds),
      session_day_overrides: await byProfile("session_day_overrides"),
    },
    results: {
      benchmark_results: benchmarkResults,
      benchmark_definitions: await selectIn(supabase, "benchmark_definitions", "id", idsOf(benchmarkResults, "benchmark_id")),
      race_results: await byProfile("athlete_race_results"),
      imported_workouts: await byProfile("imported_workouts"),
      // Migration 0036; a database without it exports without them.
      garmin_runs: await byProfile("garmin_runs").catch(() => []),
      garmin_fitness: await byProfile("garmin_fitness").catch(() => []),
    },
    vacations: await byProfile("vacations"),
    ai_suggestions: await byProfile("ai_suggestions"),
    strength: {
      templates,
      exercises: await selectIn(supabase, "strength_exercises", "template_id", idsOf(templates)),
      set_logs: await selectIn(supabase, "strength_set_logs", "session_id", sessionIds),
      // Migration 0038: which planned session a MyHealthHub strength workout ticked off.
      hub_links: await byProfile("hub_strength_links").catch(() => []),
    },
  };
}
