// ============================================================================
// MyHealthHub — the athlete's own data hub — talks to this app over two
// bearer-guarded routes:
//   GET  /api/hub/export    HUB_EXPORT_TOKEN   the export, for the hub's copy
//   POST /api/hub/strength  HUB_INGEST_SECRET  a strength workout from the hub
// Both compare in constant time and fail closed when their secret is unset.
// ============================================================================
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export function hubBearerOk(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const actual = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(actual);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The one athlete these server-to-server routes act for (same rule as /api/garmin/import). */
export async function resolveSingleProfileId(
  admin: SupabaseClient,
): Promise<string | null | "ambiguous"> {
  const pinned = process.env.GARMIN_IMPORT_PROFILE_ID;
  if (pinned) return pinned;
  const { data, error } = await admin.from("athlete_profiles").select("id").limit(2);
  if (error) throw new Error("profile lookup failed");
  if (!data?.length) return null;
  return data.length > 1 ? "ambiguous" : data[0].id;
}
