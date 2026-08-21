// ============================================================================
// Email fallback via Resend (Phase D3, §7 open question 4): when an athlete
// hasn't connected Telegram, the evening check-in arrives by email instead.
// Plain REST call — no extra dependency. Unconfigured -> no-op (returns false).
// ============================================================================

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!emailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function checkinEmailHtml(sessionTitle: string, durationMin: number): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h2 style="margin:0 0 8px">🏋️ Today's session: ${sessionTitle}</h2>
    <p style="margin:0 0 16px;color:#555">${durationMin} min planned. Did you get it done?
    One tap in the app logs it — and quietly tunes your plan.</p>
    <a href="${appUrl}/plan"
       style="display:inline-block;background:#ff5a1f;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">
      Log it now
    </a>
    <p style="margin:20px 0 0;font-size:12px;color:#999">
      Tip: connect Telegram in the app for one-tap logging without opening a browser.
    </p>
  </div>`;
}
