import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Magic-link landing point. Supabase sends the athlete here after they click
// the email link; we trade the one-time code for a session cookie server-side
// (the documented @supabase/ssr flow) and then send them into the app.
//
// Two link shapes are handled, because which one Supabase uses depends on the
// project's email template:
//   ?code=...                     — PKCE (default for signInWithOtp)
//   ?token_hash=...&type=magiclink — the older OTP-verification shape
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/plan";

  // Behind Vercel's proxy the request URL is the internal host — build
  // redirects from the forwarded host so the athlete stays on their domain.
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin;

  const supabase = supabaseServer();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(
      `${origin}/onboarding?auth_error=${encodeURIComponent(error.message)}`,
    );
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "magiclink" | "email" | "signup" | "recovery" | "invite",
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(
      `${origin}/onboarding?auth_error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}/onboarding?auth_error=missing_code`);
}
