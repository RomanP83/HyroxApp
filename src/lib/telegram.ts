// ============================================================================
// Telegram helpers (Implementation Plan §4 — the heimliche adherence + data
// lever, PP5). HMAC deep-links connect a chat to an athlete profile without
// accounts; 4 inline buttons map to RPE deltas and feed micro-calibration.
// ============================================================================
import crypto from "crypto";

const API = (method: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export async function tgSendMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: unknown,
): Promise<void> {
  await fetch(API("sendMessage"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup: replyMarkup }),
  });
}

export async function tgAnswerCallback(callbackId: string, text?: string): Promise<void> {
  await fetch(API("answerCallbackQuery"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}

/** The 4-button quick-log keyboard for one session (§2 Must-Have). */
export function quickLogKeyboard(sessionId: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ As planned", callback_data: `log:${sessionId}:planned` },
        { text: "🔥 Harder", callback_data: `log:${sessionId}:harder` },
      ],
      [
        { text: "🪶 Easier", callback_data: `log:${sessionId}:easier` },
        { text: "⏭️ Skip", callback_data: `log:${sessionId}:skip` },
      ],
    ],
  };
}

// ── HMAC deep-link (pattern noted in §6, "wie bei miofatturato") ─────────────
export function signDeepLink(profileId: string): string {
  const secret = process.env.TELEGRAM_DEEPLINK_SECRET ?? "";
  const mac = crypto.createHmac("sha256", secret).update(profileId).digest("hex").slice(0, 16);
  // Telegram /start payload must be short & url-safe.
  return Buffer.from(`${profileId}.${mac}`).toString("base64url");
}

export function verifyDeepLink(payload: string): string | null {
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const [profileId, mac] = decoded.split(".");
    const secret = process.env.TELEGRAM_DEEPLINK_SECRET ?? "";
    const expected = crypto.createHmac("sha256", secret).update(profileId).digest("hex").slice(0, 16);
    return mac === expected ? profileId : null;
  } catch {
    return null;
  }
}
