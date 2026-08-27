// ============================================================================
// Logging a race, and what the app learns from it.
//
// Eight station times measured under race conditions beat any number of RPE
// answers, so this route does two things: it stores the result, and it resets
// the station tiers from it. Everything downstream — the catalogues' weakness
// bias, the finish-time estimate, the pacing plan for the next race — improves
// without knowing a race result exists.
//
// The pace zones are deliberately NOT touched here. Race pace under station
// fatigue is not the same number as a fresh 1 km time trial, and overwriting a
// calibrated zone with it would make every easy run slower for the wrong
// reason. The benchmarks own the zones; the race owns the stations.
// ============================================================================
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { roxzoneFromResult, STATION_ORDER, tiersFromRaceResult } from "@/lib/engine";
import type { Station } from "@/lib/engine";

export const runtime = "nodejs";

const Seconds = z.number().int().min(1).max(60 * 60 * 6);
const Body = z.object({
  race_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  division: z.enum(["open", "pro", "doubles", "masters_open", "masters_pro"]),
  name: z.string().max(120).optional(),
  total_seconds: Seconds,
  /** Eight kilometre splits in race order; a partial entry is allowed. */
  run_splits: z.array(Seconds).max(8),
  /** Seconds per station, keyed by the engine's own station names. */
  station_times: z.record(z.string(), Seconds),
  roxzone_seconds: z.number().int().min(0).max(60 * 60).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const body = parsed.data;

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  // Only stations the engine knows; a typo in a key is a silently lost split.
  const known = new Set<string>(STATION_ORDER);
  const stationTimes: Partial<Record<Station, number>> = {};
  for (const [key, value] of Object.entries(body.station_times)) {
    if (known.has(key)) stationTimes[key as Station] = value;
  }

  const runTotal = body.run_splits.reduce((a, b) => a + b, 0);
  const stationTotal = Object.values(stationTimes).reduce((a, b) => a + b, 0);
  if (runTotal + stationTotal > body.total_seconds) {
    return NextResponse.json(
      {
        error: "splits_exceed_total",
        detail: `Your splits add up to more than the finish time: ${Math.round(
          (runTotal + stationTotal) / 60,
        )} min of runs and stations against a ${Math.round(
          body.total_seconds / 60,
        )} min race. Check the entry.`,
      },
      { status: 400 },
    );
  }

  const roxzone =
    body.roxzone_seconds ??
    roxzoneFromResult({
      totalSeconds: body.total_seconds,
      runSplits: body.run_splits,
      stationTimes,
    });

  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("profile_id", profile.id)
    .lte("starts_on", body.race_date)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: saved, error } = await supabase
    .from("race_results")
    .insert({
      profile_id: profile.id,
      plan_id: plan?.id ?? null,
      race_date: body.race_date,
      division: body.division,
      name: body.name ?? null,
      total_seconds: body.total_seconds,
      run_splits: body.run_splits,
      station_times: stationTimes,
      roxzone_seconds: roxzone,
      notes: body.notes ?? null,
    })
    .select("id")
    .single();
  if (error || !saved) {
    return NextResponse.json(
      { error: "save_failed", detail: error?.message ?? "no row returned" },
      { status: 500 },
    );
  }

  // Recalibrate the stations from what the race actually showed. athlete_state
  // is engine-owned, so this goes through the service-role client.
  const tiers = tiersFromRaceResult({ division: body.division, stationTimes });
  let recalibrated = 0;
  if (Object.keys(tiers).length) {
    const admin = supabaseAdmin();
    const { data: state } = await admin
      .from("athlete_state")
      .select("station_tiers")
      .eq("profile_id", profile.id)
      .single();
    const merged = { ...((state?.station_tiers as Record<string, number>) ?? {}), ...tiers };
    await admin.from("athlete_state").update({ station_tiers: merged }).eq("profile_id", profile.id);
    recalibrated = Object.keys(tiers).length;
  }

  return NextResponse.json({ id: saved.id, roxzone_seconds: roxzone, recalibrated });
}
