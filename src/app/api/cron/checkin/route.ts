import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { tgSendMessage, quickLogKeyboard } from "@/lib/telegram";
import { sendEmail, checkinEmailHtml, emailConfigured } from "@/lib/email";

export const runtime = "nodejs";

// Evening check-in (B1 + D3): finds every athlete with an unlogged session
// scheduled for today and pings them — via the Telegram 4-button quick-log
// when connected (the adherence + data lever, PP5), otherwise via a Resend
// email fallback (§7 open question 4: the channel for the <30%-connect case).
function authed(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** JS getUTCDay (0=Sun..6=Sat) -> plan day_hint (1=Mon..7=Sun). */
function todayDayHint(now: Date = new Date()): number {
  return ((now.getUTCDay() + 6) % 7) + 1;
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const telegramOn = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  const emailOn = emailConfigured();
  if (!telegramOn && !emailOn) {
    return NextResponse.json({ ok: true, skipped: "no channel configured" });
  }

  const admin = supabaseAdmin();
  const dayHint = todayDayHint();

  const { data: profiles } = await admin
    .from("athlete_profiles")
    .select("id, user_id, telegram_chat_id");

  let sentTelegram = 0;
  let sentEmail = 0;

  for (const profile of profiles ?? []) {
    const { data: plan } = await admin
      .from("plans")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("status", "active")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!plan) continue;

    const { data: week } = await admin
      .from("plan_weeks")
      .select("id")
      .eq("plan_id", plan.id)
      .eq("status", "current")
      .maybeSingle();
    if (!week) continue;

    const { data: sessions } = await admin
      .from("sessions")
      .select("id, title, planned_duration_min, session_type, day_slot")
      .eq("week_id", week.id)
      .eq("day_hint", dayHint)
      .in("status", ["planned", "moved"]);
    if (!sessions?.length) continue;

    // Skip anything already logged (defensive — status should cover it).
    const { data: logged } = await admin
      .from("session_logs")
      .select("session_id")
      .in("session_id", sessions.map((s) => s.id));
    const loggedIds = new Set((logged ?? []).map((l) => l.session_id));
    const due = sessions.filter((s) => !loggedIds.has(s.id) && s.session_type !== "rest");
    if (!due.length) continue;

    // A double day sends two messages — say which half each one is about.
    const label = (s: { day_slot?: string | null }) =>
      due.length > 1 ? `${(s.day_slot ?? "am").toUpperCase()} session` : "session";

    if (profile.telegram_chat_id && telegramOn) {
      for (const s of due) {
        await tgSendMessage(
          profile.telegram_chat_id,
          `🏋️ Today's ${label(s)}: <b>${s.title}</b> (${s.planned_duration_min} min).\nDid you get it done? One tap logs it — and tunes your plan.`,
          quickLogKeyboard(s.id),
        );
        sentTelegram++;
      }
    } else if (emailOn) {
      // D3: email fallback — one mail per athlete, first due session leads.
      const { data: userInfo } = await admin.auth.admin.getUserById(profile.user_id);
      const email = userInfo?.user?.email;
      if (email) {
        const ok = await sendEmail(
          email,
          `Today's ${label(due[0])}: ${due[0].title}`,
          checkinEmailHtml(due[0].title, due[0].planned_duration_min),
        );
        if (ok) sentEmail++;
      }
    }
  }

  return NextResponse.json({ ok: true, sent_telegram: sentTelegram, sent_email: sentEmail });
}

export const GET = POST;
