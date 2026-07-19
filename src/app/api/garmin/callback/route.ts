import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { exchangeCode, fetchGarminUserId, verifyGarminState } from "@/lib/garmin";

// Garmin OAuth2 callback — verify the signed state (carries the PKCE
// verifier), exchange the code, resolve the Garmin user id, store tokens.
export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(`${appUrl}/plan?garmin=error`);

  const parsed = verifyGarminState(state);
  if (!parsed) return NextResponse.redirect(`${appUrl}/plan?garmin=error`);

  // The state binds the flow to a profile; the cookie session must own it.
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${appUrl}/onboarding`);
  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.id !== parsed.profileId) {
    return NextResponse.redirect(`${appUrl}/plan?garmin=error`);
  }

  const tokens = await exchangeCode(code, parsed.verifier);
  if (!tokens) return NextResponse.redirect(`${appUrl}/plan?garmin=error`);

  const garminUserId = await fetchGarminUserId(tokens.access_token);
  if (!garminUserId) return NextResponse.redirect(`${appUrl}/plan?garmin=error`);

  await supabaseAdmin()
    .from("athlete_profiles")
    .update({
      garmin_user_id: garminUserId,
      garmin_access_token: tokens.access_token,
      garmin_refresh_token: tokens.refresh_token,
      garmin_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    })
    .eq("id", parsed.profileId);

  return NextResponse.redirect(`${appUrl}/plan?garmin=connected`);
}
