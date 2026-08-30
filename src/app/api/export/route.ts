// ============================================================================
// Everything you have ever logged, in one file.
//
// This app has one athlete and one Supabase project, which makes that project a
// single point of failure for years of training history. For a product with
// many users an export is a compliance chore; here it is the backup.
//
// Self-contained on purpose: the workout_blocks rows a session actually points
// at travel with it, so the file can be read on its own rather than only
// against a database that still has the same library seeded.
//
// Left out deliberately: the rest of the block library (regenerable from
// librarySeed.ts), the static benchmark definitions, and the knowledge pipeline
// — none of them are things you did, and all of them come back from the repo.
// ============================================================================
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkIds, idsOf } from "@/lib/exportChunks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  try {
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
    const templates = await byProfile("strength_templates");

    const payload = {
      exported_at: new Date().toISOString(),
      // Bumped when the shape changes, so an old file is still readable.
      format: 1,
      athlete: { profile, state: (await byProfile("athlete_state"))[0] ?? null },
      season: {
        races: await byProfile("races"),
        seasons,
        season_races: await selectIn(supabase, "season_races", "season_id", seasonIds),
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
        workout_blocks: await selectIn(
          supabase,
          "workout_blocks",
          "id",
          idsOf(sessionBlocks, "block_id"),
        ),
        session_logs: await selectIn(supabase, "session_logs", "session_id", sessionIds),
        plan_adjustments: await selectIn(supabase, "plan_adjustments", "plan_id", planIds),
        session_day_overrides: await byProfile("session_day_overrides"),
      },
      results: {
        benchmark_results: await byProfile("benchmark_results"),
        race_results: await byProfile("race_results"),
      },
      strength: {
        templates,
        exercises: await selectIn(supabase, "strength_exercises", "template_id", idsOf(templates)),
        set_logs: await selectIn(supabase, "strength_set_logs", "session_id", sessionIds),
      },
    };

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="hyroxhub-${stamp}.json"`,
        // A backup is never served from a cache.
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "export_failed", detail: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
