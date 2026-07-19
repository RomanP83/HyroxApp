import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { processGarminSummary, type GarminActivitySummary } from "@/lib/garmin";

export const runtime = "nodejs";

// Garmin Push webhook (URL registered in the Garmin developer portal).
// The Push service delivers activity summaries inline as {"activities": [...]}
// — each running activity is handed to the shared auto-log path. Garmin
// expects a fast 200 on every delivery; anything else triggers retries and
// can get the endpoint disabled, so unknown payloads are acknowledged and
// dropped.
export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  const activities: GarminActivitySummary[] = Array.isArray(payload?.activities)
    ? payload.activities
    : [];

  if (activities.length) {
    const admin = supabaseAdmin();
    for (const summary of activities) {
      await processGarminSummary(admin, summary).catch(() => null);
    }
  }

  return NextResponse.json({ ok: true });
}

// Garmin sends a HEAD/GET reachability check when the webhook URL is saved.
export async function GET() {
  return NextResponse.json({ ok: true });
}
