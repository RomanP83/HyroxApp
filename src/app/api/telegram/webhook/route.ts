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
      .select(
        "id, intensity_rpe_target, planned_duration_min, plans!inner(athlete_profiles!inner(telegram_chat_id))",
      )
      .eq("id", sessionId)
      .single();
    if (!session) {
      await tgAnswerCallback(cb.id, "Session not found.");
      return NextResponse.json({ ok: true });
    }

    // A5/M1: the chat pressing the button must be the plan owner's connected
    // chat — callback_data is client-controlled and must not log foreign
    // sessions (and thereby recalibrate foreign plans).
    const owned = session as unknown as {
      plans: { athlete_profiles: { telegram_chat_id: string | null } };
    };
    const ownerChatId = owned.plans?.athlete_profiles?.telegram_chat_id;
    if (!ownerChatId || String(ownerChatId) !== String(cb.message?.chat?.id)) {
      await tgAnswerCallback(cb.id, "This session belongs to a different account.");
      return NextResponse.json({ ok: true });
    }

    if (action === "skip") {
      const { error } = await admin.from("sessions").update({ status: "skipped" })
        .eq("id", sessionId).in("status", ["planned", "moved", "skipped"]);
      if (error) return NextResponse.json({ error: "skip_failed" }, { status: 500 });
      await tgAnswerCallback(cb.id, "Skipped — noted. No make-up pile-up.");
      return NextResponse.json({ ok: true });
    }

    const delta = DELTA[action] ?? 0;
    const rpe = Math.max(1, Math.min(10, session.intensity_rpe_target + delta));
    const { data: written, error } = await admin.rpc("record_session_completion", {
      p_session: sessionId,
      p_completed_as_planned: action === "planned",
      p_rpe: rpe,
      p_duration: session.planned_duration_min,
      p_block_results: null,
      p_notes: null,
    });
    if (error) return NextResponse.json({ error: "log_failed" }, { status: 500 });
    if (!written?.created) {
      await tgAnswerCallback(cb.id, "Already logged — no changes made.");
      return NextResponse.json({ ok: true });
    }

    const outcome = await applyMicroForSession(admin, sessionId);
    const reason = outcome?.adjustments?.[0]?.reason;
    await tgAnswerCallback(cb.id, "Logged ✅");
    if (reason) await tgSendMessage(cb.message.chat.id, `⚙️ ${reason}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
