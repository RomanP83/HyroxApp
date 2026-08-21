import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildWeeklyReview } from "@/lib/weeklyReview";
import { tgSendMessage } from "@/lib/telegram";
import { sendEmail, emailConfigured } from "@/lib/email";

export const runtime = "nodejs";

// C3: Sunday-evening weekly review — Telegram first, email fallback,
// same channel logic as the daily check-in.
function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = supabaseAdmin();
  const telegramOn = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const emailOn = emailConfigured();
  if (!telegramOn && !emailOn) {
    return NextResponse.json({ ok: true, skipped: "no channel configured" });
  }

  const { data: plans } = await admin
    .from("plans")
    .select("id, profile_id")
    .eq("status", "active");

  let sent = 0;
  for (const plan of plans ?? []) {
    const review = await buildWeeklyReview(admin, plan.id);
    if (!review) continue;

    const { data: profile } = await admin
      .from("athlete_profiles")
      .select("user_id, telegram_chat_id")
      .eq("id", plan.profile_id)
      .single();
    if (!profile) continue;

    if (profile.telegram_chat_id && telegramOn) {
      await tgSendMessage(profile.telegram_chat_id, review.text);
      sent++;
    } else if (emailOn) {
      const { data: userInfo } = await admin.auth.admin.getUserById(profile.user_id);
      const email = userInfo?.user?.email;
      if (email && (await sendEmail(email, "Your weekly training review", review.html))) sent++;
    }
  }

  return NextResponse.json({ ok: true, sent });
}

export const GET = POST;
