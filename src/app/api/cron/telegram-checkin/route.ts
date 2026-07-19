import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { tgSendMessage, quickLogKeyboard } from "@/lib/telegram";

export const runtime = "nodejs";

// B1 (fixes M2): the evening check-in that actually SENDS the 4-button
// quick-log message — the adherence + data lever from plan §4/PP5. Runs via
// cron; finds every connected athlete with an unlogged session scheduled for
// today and pings them once.
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
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ ok: true, skipped: "telegram not configured" });
  }

  const admin = supabaseAdmin();
  const dayHint = todayDayHint();

  const { data: profiles } = await admin
    .from("athlete_profiles")
    .select("id, telegram_chat_id")
    .not("telegram_chat_id", "is", null);

  let sent = 0;
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
      .select("id, title, planned_duration_min, session_type")
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

    for (const s of sessions.filter((s) => !loggedIds.has(s.id) && s.session_type !== "rest")) {
      await tgSendMessage(
        profile.telegram_chat_id!,
        `🏋️ Today's session: <b>${s.title}</b> (${s.planned_duration_min} min).\nDid you get it done? One tap logs it — and tunes your plan.`,
        quickLogKeyboard(s.id),
      );
      sent++;
    }
  }

  return NextResponse.json({ ok: true, sent });
}

export const GET = POST;
