import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { IMPORT_SOURCE, mapHyroxTraining } from "@/lib/import/hyroxTraining";

export const runtime = "nodejs";
export const maxDuration = 60;

// Import a HyroxTraining backup (sent slimmed by the settings page). Every
// row is keyed by (profile, source, source_id): re-importing the same file,
// or a newer one, only adds what is new. Nothing here touches the plan or
// the engine's fitness state — imported workouts are history.
const CHUNK = 500;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  let plan;
  try {
    plan = mapHyroxTraining(body);
  } catch {
    return NextResponse.json({ error: "not_a_tracker_backup" }, { status: 400 });
  }

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("athlete_profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  // Insert-only: an existing (source, source_id) row is left as it is.
  async function insertNew(table: string, rows: Record<string, unknown>[]): Promise<number | string> {
    let added = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { data, error } = await supabase
        .from(table)
        .upsert(rows.slice(i, i + CHUNK), { onConflict: "profile_id,source,source_id", ignoreDuplicates: true })
        .select("id");
      if (error) return error.message;
      added += data?.length ?? 0;
    }
    return added;
  }

  const workouts = await insertNew(
    "imported_workouts",
    plan.workouts.map((w) => ({ ...w, profile_id: profile.id })),
  );
  if (typeof workouts === "string") {
    return NextResponse.json({ error: "import_failed", detail: workouts }, { status: 500 });
  }

  const races = await insertNew(
    "athlete_race_results",
    plan.races.map((r) => ({ ...r, profile_id: profile.id })),
  );
  if (typeof races === "string") return NextResponse.json({ error: "import_failed", detail: races }, { status: 500 });

  const { data: defs } = await supabase.from("benchmark_definitions").select("id, slug");
  const idOf = new Map((defs ?? []).map((d: { id: string; slug: string }) => [d.slug, d.id]));
  const benchRows = plan.benchmarks
    .filter((b) => idOf.has(b.slug))
    .map((b) => ({
      profile_id: profile.id,
      benchmark_id: idOf.get(b.slug),
      value: b.value,
      recorded_at: b.recorded_at,
      phase_context: "start",
      source: IMPORT_SOURCE,
      source_id: b.source_id,
    }));
  const benchmarks = await insertNew("benchmark_results", benchRows);
  if (typeof benchmarks === "string") {
    return NextResponse.json({ error: "import_failed", detail: benchmarks }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    found: { workouts: plan.workouts.length, races: plan.races.length, benchmarks: plan.benchmarks.length },
    added: { workouts, races, benchmarks },
    skipped: plan.skipped,
  });
}
