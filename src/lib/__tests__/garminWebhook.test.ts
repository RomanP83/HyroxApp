import { afterEach, describe, expect, it } from "vitest";
import { garminWebhookAuthed } from "@/lib/garminWebhookAuth";

const originalSecret = process.env.GARMIN_WEBHOOK_SECRET;

afterEach(() => {
  if (originalSecret == null) delete process.env.GARMIN_WEBHOOK_SECRET;
  else process.env.GARMIN_WEBHOOK_SECRET = originalSecret;
});

describe("Garmin webhook authentication", () => {
  it("fails closed when no secret is configured", () => {
    delete process.env.GARMIN_WEBHOOK_SECRET;
    expect(garminWebhookAuthed(new Request("https://app.test/api/garmin/webhook"))).toBe(false);
  });

  it("accepts the registered URL token", () => {
    process.env.GARMIN_WEBHOOK_SECRET = "correct-horse";
    const req = new Request("https://app.test/api/garmin/webhook?token=correct-horse");
    expect(garminWebhookAuthed(req)).toBe(true);
  });

  it("rejects an incorrect header", () => {
    process.env.GARMIN_WEBHOOK_SECRET = "correct-horse";
    const req = new Request("https://app.test/api/garmin/webhook", {
      headers: { "x-garmin-webhook-secret": "wrong" },
    });
    expect(garminWebhookAuthed(req)).toBe(false);
  });
});
