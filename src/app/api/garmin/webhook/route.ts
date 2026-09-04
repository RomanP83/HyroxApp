import { NextResponse } from "next/server";
import { garminWebhookAuthed } from "@/lib/garminWebhookAuth";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { processGarminSummary } from "@/lib/garmin";

export const runtime = "nodejs";

const Summary = z.object({
  userId: z.string().min(1),
  activityType: z.string().optional(),
  activityName: z.string().max(500).optional(),
  durationInSeconds: z.number().finite().nonnegative().optional(),
  distanceInMeters: z.number().finite().nonnegative().optional(),
  startTimeInSeconds: z.number().finite().positive().optional(),
});

// Garmin Push webhook (URL registered in the Garmin developer portal).
// The Push service delivers activity summaries inline as {"activities": [...]}
// — each running activity is handed to the shared auto-log path. Garmin
// Authentication is mandatory because successful processing uses the service
// role. Garmin webhook registrations that cannot set a header may put the
// same secret in the registered URL as ?token=...
export async function POST(req: Request) {
  if (!garminWebhookAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  const activities: unknown[] = Array.isArray(payload?.activities)
    ? payload.activities
    : [];
  if (activities.length > 20) {
    return NextResponse.json({ error: "too_many_activities" }, { status: 413 });
  }
  const parsed = z.array(Summary).safeParse(activities);
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });

  if (activities.length) {
    const admin = supabaseAdmin();
    for (const summary of parsed.data) {
      try {
        await processGarminSummary(admin, summary);
      } catch {
        // A database outage must be retried, not acknowledged and lost.
        return NextResponse.json({ error: "processing_failed" }, { status: 503 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// Garmin sends a HEAD/GET reachability check when the webhook URL is saved.
export async function GET(req: Request) {
  if (!garminWebhookAuthed(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
