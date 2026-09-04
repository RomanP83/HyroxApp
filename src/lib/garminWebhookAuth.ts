import crypto from "crypto";

/** Fail closed; the registered Push URL may carry ?token= when headers cannot be set. */
export function garminWebhookAuthed(req: Request): boolean {
  const expected = process.env.GARMIN_WEBHOOK_SECRET;
  if (!expected) return false;
  const actual = req.headers.get("x-garmin-webhook-secret") ??
    new URL(req.url).searchParams.get("token") ?? "";
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
