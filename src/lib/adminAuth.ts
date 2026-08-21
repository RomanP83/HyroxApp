// ============================================================================
// Operator guard for the /api/admin surface. Same shared secret the crons use:
// one secret to rotate, no second auth system, and nothing user-facing.
// Without CRON_SECRET the routes stay open in dev and closed in production.
// ============================================================================
import { NextResponse } from "next/server";

export function operatorAuthed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Returns null when the request may proceed, otherwise the response to send.
 * Admin routes all read through the service role — checking that up front
 * turns a missing key into a readable 503 instead of a stack trace.
 */
export function operatorGuard(req: Request): NextResponse | null {
  if (!operatorAuthed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "service_role_not_configured" }, { status: 503 });
  }
  return null;
}
