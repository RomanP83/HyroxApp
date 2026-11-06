import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { exchangeCode, verifyState } from "@/lib/strava";

// C2: OAuth callback — verify the HMAC state, exchange the code, store tokens.
export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(`${appUrl}/plan?strava=error`);

  const profileId = verifyState(state);
  if (!profileId) return NextResponse.redirect(`${appUrl}/plan?strava=error`);

  // The state binds the flow to a profile; the cookie session must own it.
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${appUrl}/onboarding`);
  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.id !== profileId) {
    return NextResponse.redirect(`${appUrl}/plan?strava=error`);
  }

  const tokens = await exchangeCode(code);
  if (!tokens?.athlete?.id) return NextResponse.redirect(`${appUrl}/plan?strava=error`);

  await supabaseAdmin()
    .from("athlete_profiles")
    .update({
      strava_athlete_id: tokens.athlete.id,
      strava_access_token: tokens.access_token,
      strava_refresh_token: tokens.refresh_token,
      strava_expires_at: new Date(tokens.expires_at * 1000).toISOString(),
    })
    .eq("id", profileId);

  return NextResponse.redirect(`${appUrl}/plan?strava=connected`);
}
