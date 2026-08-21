// ============================================================================
// Strava sync — runs only (Phase C2, §2 Should-Have V2).
// One API instead of the Garmin/Coros/Polar zoo: new Run activities arrive via
// webhook, get matched to a planned run-type session, and logged with the real
// pace in block_results — which feeds the EXISTING pace-zone calibration in
// the adaptive engine. No new adaptation path, just a better signal source.
// ============================================================================
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoLogRun, paceSecPerKm } from "@/lib/autoLogRun";

export { paceSecPerKm }; // shared with Garmin; re-exported for existing callers

export function stravaConfigured(): boolean {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

// ── OAuth state (HMAC over the profile id, keyed on the client secret) ──────
export function signState(profileId: string): string {
  const mac = crypto
    .createHmac("sha256", process.env.STRAVA_CLIENT_SECRET ?? "")
    .update(profileId)
    .digest("hex")
    .slice(0, 16);
  return Buffer.from(`${profileId}.${mac}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const [profileId, mac] = Buffer.from(state, "base64url").toString("utf8").split(".");
    const expected = crypto
      .createHmac("sha256", process.env.STRAVA_CLIENT_SECRET ?? "")
      .update(profileId)
      .digest("hex")
      .slice(0, 16);
    return mac === expected ? profileId : null;
  } catch {
    return null;
  }
}

export function authorizeUrl(profileId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID ?? "",
    redirect_uri: `${appUrl}/api/strava/callback`,
    response_type: "code",
    scope: "activity:read",
    state: signState(profileId),
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete?: { id: number };
}

export async function exchangeCode(code: string): Promise<TokenResponse | null> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  return res.ok ? res.json() : null;
}

/** Returns a valid access token for the profile, refreshing when expired. */
export async function accessTokenFor(
  admin: SupabaseClient,
  profile: {
    id: string;
    strava_access_token: string | null;
    strava_refresh_token: string | null;
    strava_expires_at: string | null;
  },
): Promise<string | null> {
  if (!profile.strava_access_token || !profile.strava_refresh_token) return null;
  const expires = profile.strava_expires_at ? new Date(profile.strava_expires_at).getTime() : 0;
  if (expires - Date.now() > 5 * 60_000) return profile.strava_access_token;

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: profile.strava_refresh_token,
    }),
  });
  if (!res.ok) return null;
  const t = (await res.json()) as TokenResponse;
  await admin
    .from("athlete_profiles")
    .update({
      strava_access_token: t.access_token,
      strava_refresh_token: t.refresh_token,
      strava_expires_at: new Date(t.expires_at * 1000).toISOString(),
    })
    .eq("id", profile.id);
  return t.access_token;
}

/**
 * Webhook worker: fetch the activity, and if it's a Run, hand it to the shared
 * auto-logging path (match to a planned session -> log -> micro-calibrate).
 */
export async function processActivity(
  admin: SupabaseClient,
  stravaAthleteId: number,
  activityId: number,
): Promise<string | null> {
  const { data: profile } = await admin
    .from("athlete_profiles")
    .select("id, strava_access_token, strava_refresh_token, strava_expires_at")
    .eq("strava_athlete_id", stravaAthleteId)
    .maybeSingle();
  if (!profile) return null;

  const token = await accessTokenFor(admin, profile);
  if (!token) return null;

  const actRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!actRes.ok) return null;
  const act = await actRes.json();
  if (act.type !== "Run" && act.sport_type !== "Run") return null;

  const pace = paceSecPerKm(act.distance, act.moving_time);
  if (pace == null) return null;

  return autoLogRun(admin, profile.id, {
    paceSecKm: pace,
    durationMin: act.moving_time / 60,
    distanceM: act.distance,
    source: "Strava",
    name: act.name,
    startedAt: act.start_date,
  });
}
