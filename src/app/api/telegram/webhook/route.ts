import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { applyMicroForSession } from "@/lib/adaptiveRunner";
import { tgAnswerCallback, tgSendMessage, verifyDeepLink } from "@/lib/telegram";

export const runtime = "nodejs";

// Telegram sends this secret back in a header we set at setWebhook time.
function authed(req: Request): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  return req.headers.get("x-telegram-bot-api-secret-token") === expected;
}

// 4 buttons -> RPE delta (§3: "Härter/Leichter setzen rpe_actual = target ± 2").
const DELTA: Record<string, number> = { planned: 0, harder: 2, easier: -2 };

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const update = await req.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: true });

  const admin = supabaseAdmin();

  // ── /start <deeplink>: connect this chat to an athlete profile ────────────
  const text: string | undefined = update.message?.text;
  if (text?.startsWith("/start")) {
    const payload = text.split(" ")[1];
    const chatId = update.message.chat.id;
    const profileId = payload ? verifyDeepLink(payload) : null;
    if (profileId) {
      await admin
        .from("athlete_profiles")
        .update({ telegram_chat_id: String(chatId) })
        .eq("id", profileId);
      await tgSendMessage(chatId, "✅ Connected! I'll check in around your sessions. One tap logs it — and quietly tunes your plan.");
    } else {
      await tgSendMessage(chatId, "👋 Open the app and tap “Connect Telegram” to link this chat.");
    }
    return NextResponse.json({ ok: true });
  }

  // ── Quick-log callback: log:<sessionId>:<action> ──────────────────────────
  const cb = update.callback_query;
  if (cb?.data?.startsWith("log:")) {
    const [, sessionId, action] = cb.data.split(":");

    const { data: session } = await admin
      .from("sessions")
      .select("id, intensity_rpe_target, planned_duration_min")
      .eq("id", sessionId)
      .single();
    if (!session) {
      await tgAnswerCallback(cb.id, "Session not found.");
      return NextResponse.json({ ok: true });
    }

    if (action === "skip") {
      await admin.from("sessions").update({ status: "skipped" }).eq("id", sessionId);
      await tgAnswerCallback(cb.id, "Skipped — noted. No make-up pile-up.");
      return NextResponse.json({ ok: true });
    }

    const delta = DELTA[action] ?? 0;
    const rpe = Math.max(1, Math.min(10, session.intensity_rpe_target + delta));
    await admin.from("session_logs").upsert(
      {
        session_id: sessionId,
        completed_as_planned: action === "planned",
        rpe_actual: rpe,
        duration_actual_min: session.planned_duration_min,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "session_id" },
    );
    await admin.from("sessions").update({ status: "done" }).eq("id", sessionId);

    const outcome = await applyMicroForSession(admin, sessionId);
    const reason = outcome?.adjustments?.[0]?.reason;
    await tgAnswerCallback(cb.id, "Logged ✅");
    if (reason) await tgSendMessage(cb.message.chat.id, `⚙️ ${reason}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
