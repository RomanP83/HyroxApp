import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildExportPayload } from "@/lib/exportPayload";
import { hubBearerOk, resolveSingleProfileId } from "@/lib/hubAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The same export as /api/export, for MyHealthHub's daily pull — with a bearer
// token instead of a browser login. Without HUB_EXPORT_TOKEN the route does
// not exist (404), so an unconfigured deployment exposes nothing.
export async function GET(req: Request) {
  if (!process.env.HUB_EXPORT_TOKEN) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!hubBearerOk(req, process.env.HUB_EXPORT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  let profileId: string | null | "ambiguous";
  try {
    profileId = await resolveSingleProfileId(admin);
  } catch {
    return NextResponse.json({ error: "processing_failed" }, { status: 503 });
  }
  if (!profileId) return NextResponse.json({ error: "no_profile" }, { status: 404 });
  if (profileId === "ambiguous") {
    return NextResponse.json({ error: "ambiguous_profile", hint: "set GARMIN_IMPORT_PROFILE_ID" }, { status: 409 });
  }
  const { data: profile } = await admin.from("athlete_profiles").select("*").eq("id", profileId).single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  try {
    return NextResponse.json(await buildExportPayload(admin, profile), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "export_failed", detail: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
