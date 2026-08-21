import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { processActivity } from "@/lib/strava";

export const runtime = "nodejs";

// C2: Strava webhook. GET = subscription validation echo; POST = activity
// events. Only "create" events for activities are processed; everything else
// is acknowledged and dropped. Strava requires a fast 200 — the work here is
// small (one activity fetch + one log insert).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN && challenge) {
    return NextResponse.json({ "hub.challenge": challenge });
  }
  return NextResponse.json({ error: "verification_failed" }, { status: 403 });
}

export async function POST(req: Request) {
  const event = await req.json().catch(() => null);
  if (
    event?.object_type === "activity" &&
    event?.aspect_type === "create" &&
    typeof event.object_id === "number" &&
    typeof event.owner_id === "number"
  ) {
    await processActivity(supabaseAdmin(), event.owner_id, event.object_id).catch(() => null);
  }
  // Always 200 — Strava retries on anything else and disables noisy endpoints.
  return NextResponse.json({ ok: true });
}
