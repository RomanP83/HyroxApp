import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { authorizeUrl, stravaConfigured } from "@/lib/strava";

// C2: kick off the Strava OAuth flow for the signed-in athlete.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!stravaConfigured()) return NextResponse.json({ error: "strava_not_configured" }, { status: 404 });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/onboarding", process.env.NEXT_PUBLIC_APP_URL));

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.redirect(new URL("/onboarding", process.env.NEXT_PUBLIC_APP_URL));

  return NextResponse.redirect(authorizeUrl(profile.id));
}
