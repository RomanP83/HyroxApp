import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hubBearerOk, resolveSingleProfileId } from "@/lib/hubAuth";
import { handleHubStrength, HubStrengthBody } from "@/lib/hubStrength";

export const runtime = "nodejs";
export const maxDuration = 60;

// A strength workout from MyHealthHub (Strength Tracker → hub → here). Ticks
// off the matching planned strength session through the normal logging path;
// see lib/hubStrength.ts for the matching rules. Guarded by HUB_INGEST_SECRET.
export async function POST(req: Request) {
  if (!process.env.HUB_INGEST_SECRET) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (!hubBearerOk(req, process.env.HUB_INGEST_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = HubStrengthBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload", detail: parsed.error.issues.slice(0, 5) }, { status: 400 });
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

  try {
    return NextResponse.json(await handleHubStrength(admin, profileId, parsed.data));
  } catch (e) {
    // 5xx: the hub keeps the delivery open and tries again later.
    return NextResponse.json({ error: "processing_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
