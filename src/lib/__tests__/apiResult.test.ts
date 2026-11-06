import { describe, it, expect } from "vitest";
import { readApi } from "../apiResult";

const res = (body: string, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }) as unknown as Response;

describe("reading an API response", () => {
  it("passes a successful body straight through", async () => {
    const out = await readApi<{ planId: string }>(res(JSON.stringify({ planId: "p1" })));
    expect(out.ok).toBe(true);
    expect(out.data.planId).toBe("p1");
  });

  it("uses the server's own message when it sent one", async () => {
    const out = await readApi(res(JSON.stringify({ error: "too_many_rest_days", detail: "5 training days leave at most 2 rest days." }), 400));
    expect(out.ok).toBe(false);
    expect(out.message).toBe("5 training days leave at most 2 rest days.");
  });

  it("falls back to the error code when there is no detail", async () => {
    const out = await readApi(res(JSON.stringify({ error: "unauthorized" }), 401));
    expect(out.message).toBe("unauthorized");
  });

  it("says the server broke, instead of blaming the JSON parser", async () => {
    // This is the bug this file exists for: a crashed route returns a 500 with
    // an empty body, and `await res.json()` then reports "Unexpected end of
    // JSON input" — which replaces the real failure with a parser complaint.
    const out = await readApi(res("", 500));
    expect(out.ok).toBe(false);
    expect(out.message).toContain("500");
    expect(out.message).toContain("check the server logs");
    expect(out.message).not.toContain("JSON");
  });

  it("survives an HTML error page", async () => {
    const out = await readApi(res("<!DOCTYPE html><html>...</html>", 502));
    expect(out.ok).toBe(false);
    expect(out.message).toContain("502");
  });

  it("does not call an empty 200 a success it can use", async () => {
    const out = await readApi(res("", 200));
    expect(out.ok).toBe(false);
    expect(out.message).toContain("empty response");
  });
});
