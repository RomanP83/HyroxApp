import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { GarminImport, garminImportAuthed, mapPredictions, mapRuns, mapVo2 } from "@/lib/garminRuns";
import { autoLogGarminRuns } from "@/lib/garminLoad";

export const runtime = "nodejs";
export const maxDuration = 60;

// Garmin running history for /progress/running. A sync (e.g. a scheduled
// Claude task reading the Garmin connector) posts activities, VO2max and
// race predictions in the connector's own shapes. Guarded by
// GARMIN_IMPORT_SECRET as a Bearer token, because it writes with the service
// role. Idempotent: the same activity posted twice updates one row.
// Runs of the current week that fit a planned run session are logged against
// it (autoLogGarminRuns); all other runs reach the load as unplanned runs
// wherever the load is computed (lib/garminLoad.ts).
async function resolveProfileId(admin: ReturnType<typeof supabaseAdmin>): Promise<string | null | "ambiguous"> {
  const pinned = process.env.GARMIN_IMPORT_PROFILE_ID;
  if (pinned) return pinned;
  const { data, error } = await admin.from("athlete_profiles").select("id").limit(2);
  if (error) throw new Error("profile lookup failed");
  if (!data?.length) return null;
  return data.length > 1 ? "ambiguous" : data[0].id;
}

export async function POST(req: Request) {
  if (!process.env.GARMIN_IMPORT_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  if (!garminImportAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = GarminImport.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", detail: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }

  const admin = supabaseAdmin();
  let profileId: string | null | "ambiguous";
  try {
    profileId = await resolveProfileId(admin);
  } catch {
    return NextResponse.json({ error: "processing_failed" }, { status: 503 });
  }
  if (!profileId) return NextResponse.json({ error: "no_profile" }, { status: 404 });
  if (profileId === "ambiguous") {
    return NextResponse.json({ error: "ambiguous_profile", hint: "set GARMIN_IMPORT_PROFILE_ID" }, { status: 409 });
  }

  const { rows, skipped } = mapRuns(parsed.data);
  if (rows.length) {
    const { error } = await admin
      .from("garmin_runs")
      .upsert(rows.map((r) => ({ ...r, profile_id: profileId })), { onConflict: "profile_id,activity_id" });
    if (error) return NextResponse.json({ error: "import_failed", detail: error.message }, { status: 500 });
  }

  // Two upserts with uniform columns each, so neither nulls the other's values.
  const now = new Date().toISOString();
  const vo2 = mapVo2(parsed.data);
  if (vo2.length) {
    const { error } = await admin
      .from("garmin_fitness")
      .upsert(vo2.map((v) => ({ ...v, profile_id: profileId, updated_at: now })), { onConflict: "profile_id,on_date" });
    if (error) return NextResponse.json({ error: "import_failed", detail: error.message }, { status: 500 });
  }
  const pred = mapPredictions(parsed.data);
  if (pred) {
    const { error } = await admin
      .from("garmin_fitness")
      .upsert({ ...pred, profile_id: profileId, updated_at: now }, { onConflict: "profile_id,on_date" });
    if (error) return NextResponse.json({ error: "import_failed", detail: error.message }, { status: 500 });
  }

  // Runs of this week that match a planned run session are logged against it,
  // through the same path Strava uses (real pace → pace-zone calibration).
  // The runs are stored either way; a failure here (e.g. migration 0037 not
  // applied yet) is reported, not turned into a retry of the whole import.
  let loggedToPlan = 0;
  let autoLogError: string | undefined;
  try {
    loggedToPlan = await autoLogGarminRuns(admin, profileId);
  } catch (e) {
    autoLogError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    ok: true,
    runs: rows.length,
    logged_to_plan: loggedToPlan,
    ...(autoLogError ? { auto_log_error: autoLogError } : {}),
    skipped,
    vo2max_days: vo2.length,
    race_predictions: Boolean(pred),
  });
}
