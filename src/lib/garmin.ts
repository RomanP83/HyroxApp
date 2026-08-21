// ============================================================================
// Garmin Connect sync — runs only (extends the Strava pattern; user request).
// OAuth2 + PKCE per the Garmin Connect Developer Program docs; activities
// arrive via the Push service (webhook URL registered in the Garmin developer
// portal). Running activities are handed to the shared autoLogRun path, so
// Garmin feeds the same pace calibration as Strava — no separate logic.
//
// Endpoints follow the current Connect API docs; verify against your Garmin
// developer-portal app config on first setup:
//   authorize  https://connect.garmin.com/oauth2Confirm
//   token      https://diapi.garmin.com/di-oauth2-service/oauth/token
//   user id    https://apis.garmin.com/wellness-api/rest/user/id
// ============================================================================
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoLogRun, paceSecPerKm } from "@/lib/autoLogRun";

const AUTHORIZE_URL = "https://connect.garmin.com/oauth2Confirm";
const TOKEN_URL = "https://diapi.garmin.com/di-oauth2-service/oauth/token";
const USER_ID_URL = "https://apis.garmin.com/wellness-api/rest/user/id";

export function garminConfigured(): boolean {
  return Boolean(process.env.GARMIN_CLIENT_ID && process.env.GARMIN_CLIENT_SECRET);
}

// ── OAuth state: profileId + PKCE verifier, HMAC-signed ─────────────────────
// The verifier must survive the redirect round-trip; carrying it inside the
// signed state keeps the flow stateless server-side (same idea as Strava).
function mac(payload: string): string {
  return crypto
    .createHmac("sha256", process.env.GARMIN_CLIENT_SECRET ?? "")
    .update(payload)
    .digest("hex")
    .slice(0, 16);
}

export function signGarminState(profileId: string, verifier: string): string {
  const payload = `${profileId}.${verifier}`;
  return Buffer.from(`${payload}.${mac(payload)}`).toString("base64url");
}

export function verifyGarminState(
  state: string,
): { profileId: string; verifier: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const idx = decoded.lastIndexOf(".");
    const payload = decoded.slice(0, idx);
    const sig = decoded.slice(idx + 1);
    if (sig !== mac(payload)) return null;
    const [profileId, verifier] = [
      payload.slice(0, payload.indexOf(".")),
      payload.slice(payload.indexOf(".") + 1),
    ];
    return profileId && verifier ? { profileId, verifier } : null;
  } catch {
    return null;
  }
}

export function newCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function codeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function authorizeUrl(profileId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const verifier = newCodeVerifier();
  const params = new URLSearchParams({
    client_id: process.env.GARMIN_CLIENT_ID ?? "",
    response_type: "code",
    code_challenge: codeChallenge(verifier),
    code_challenge_method: "S256",
    redirect_uri: `${appUrl}/api/garmin/callback`,
    state: signGarminState(profileId, verifier),
  });
  return `${AUTHORIZE_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
}

export async function exchangeCode(
  code: string,
  verifier: string,
): Promise<TokenResponse | null> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.GARMIN_CLIENT_ID ?? "",
      client_secret: process.env.GARMIN_CLIENT_SECRET ?? "",
      code,
      code_verifier: verifier,
      redirect_uri: `${appUrl}/api/garmin/callback`,
    }),
  });
  return res.ok ? res.json() : null;
}

export async function fetchGarminUserId(accessToken: string): Promise<string | null> {
  const res = await fetch(USER_ID_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.userId ? String(data.userId) : null;
}

/** Valid access token for the profile, refreshing when expired. */
export async function accessTokenFor(
  admin: SupabaseClient,
  profile: {
    id: string;
    garmin_access_token: string | null;
    garmin_refresh_token: string | null;
    garmin_expires_at: string | null;
  },
): Promise<string | null> {
  if (!profile.garmin_access_token || !profile.garmin_refresh_token) return null;
  const expires = profile.garmin_expires_at ? new Date(profile.garmin_expires_at).getTime() : 0;
  if (expires - Date.now() > 5 * 60_000) return profile.garmin_access_token;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GARMIN_CLIENT_ID ?? "",
      client_secret: process.env.GARMIN_CLIENT_SECRET ?? "",
      refresh_token: profile.garmin_refresh_token,
    }),
  });
  if (!res.ok) return null;
  const t = (await res.json()) as TokenResponse;
  await admin
    .from("athlete_profiles")
    .update({
      garmin_access_token: t.access_token,
      garmin_refresh_token: t.refresh_token,
      garmin_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    })
    .eq("id", profile.id);
  return t.access_token;
}

// ── Push payload processing ─────────────────────────────────────────────────

/** Activity API summary as delivered by the Garmin Push service. */
export interface GarminActivitySummary {
  userId?: string;
  activityType?: string;
  activityName?: string;
  durationInSeconds?: number;
  distanceInMeters?: number;
}

export function isGarminRun(activityType?: string): boolean {
  return Boolean(activityType && activityType.toUpperCase().includes("RUNNING"));
}

/** Log one pushed summary; returns the session id or null when not applicable. */
export async function processGarminSummary(
  admin: SupabaseClient,
  summary: GarminActivitySummary,
): Promise<string | null> {
  if (!summary.userId || !isGarminRun(summary.activityType)) return null;
  const pace = paceSecPerKm(summary.distanceInMeters ?? 0, summary.durationInSeconds ?? 0);
  if (pace == null) return null;

  const { data: profile } = await admin
    .from("athlete_profiles")
    .select("id")
    .eq("garmin_user_id", summary.userId)
    .maybeSingle();
  if (!profile) return null;

  return autoLogRun(admin, profile.id, {
    paceSecKm: pace,
    durationMin: (summary.durationInSeconds ?? 0) / 60,
    distanceM: summary.distanceInMeters ?? 0,
    source: "Garmin",
    name: summary.activityName,
  });
}
