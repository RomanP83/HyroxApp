import { describe, it, expect, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AiCoachCard, RULE_LABEL } from "../AiCoachCard";
import type { SuggestionRow } from "@/lib/aiCoach";
import { coachSystemPrompt, COACH_RESPONSE_SCHEMA } from "@/lib/aiCoach";
import { geminiJson } from "@/lib/gemini";
import { validateSuggestions } from "@/lib/engine";

const row: SuggestionRow = {
  id: "r1",
  profile_id: "p",
  plan_id: "pl",
  created_at: "2026-11-01T18:00:00Z",
  model: "gemini-test",
  review: "Two hard sessions felt harder than planned.",
  items: [
    {
      id: "1",
      action: "easier",
      session_id: "s1",
      title: "Threshold intervals",
      reason: "RPE was two points above target twice.",
      change: "RPE 7 → 6, 60 → 55 min",
      rpe_to: 6,
      duration_to: 55,
      status: "open",
    },
    {
      id: "2",
      action: "move",
      session_id: "s2",
      title: "Long run",
      reason: "Rest day before the simulation.",
      change: "Sat AM → Sun AM",
      day_hint: 7,
      day_slot: "am",
      status: "applied",
      undo: { day_hint: 6, day_slot: "am" },
    },
  ],
  rejected: [{ proposal: { action: "harder" }, rule: "acwr_too_high" }],
};

const render = (props: Partial<Parameters<typeof AiCoachCard>[0]>) =>
  renderToStaticMarkup(
    <AiCoachCard enabled suggestion={null} onToast={() => undefined} onChanged={() => undefined} {...props} />,
  );

describe("the AI coach card", () => {
  it("says it is off without a key", () => {
    const html = render({ enabled: false });
    expect(html).toContain("GEMINI_API_KEY");
    expect(html).not.toContain("Review my training");
  });

  it("offers a review when none exists", () => {
    expect(render({})).toContain("Review my training");
  });

  it("shows the review, open and applied items, and the refusals", () => {
    const html = render({ suggestion: row });
    expect(html).toContain("Two hard sessions felt harder");
    expect(html).toContain("RPE 7 → 6, 60 → 55 min");
    expect(html).toContain(">Apply<");
    expect(html).toContain(">Undo<");
    expect(html).toContain("1 proposal refused");
    expect(html).toContain(RULE_LABEL.acwr_too_high);
  });

  it("has a label for every rule the validator can return", () => {
    const rules = new Set<string>();
    const c = { id: "a", title: "t", session_type: "run_easy" as const, day_hint: 4, day_slot: "am" as const, status: "planned", intensity_rpe_target: 9, planned_duration_min: 40, week: "current" as const, phase: "taper" as const, is_deload: true };
    const out = validateSuggestions(
      [{ action: "x" }, { action: "harder", session_id: "a", reason: "r" }, { action: "move", session_id: "a", day_hint: 9, reason: "r" }],
      { candidates: [c], acwr: 2, today_day_hint: 1 },
    );
    out.rejected.forEach((r) => rules.add(r.rule));
    for (const r of rules) expect(RULE_LABEL[r]).toBeTruthy();
  });
});

describe("the coach prompt", () => {
  it("names the menu, the language and the guardrails", () => {
    const p = coachSystemPrompt("German");
    expect(p).toContain("in German");
    expect(p).toContain('"move"');
    expect(p).toContain("Never make a taper, deload or vacation session harder");
    expect(JSON.stringify(COACH_RESPONSE_SCHEMA)).toContain('"enum":["move","easier","harder","skip"]');
  });
});

describe("geminiJson", () => {
  const prev = process.env.GEMINI_API_KEY;
  afterEach(() => {
    if (prev === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prev;
  });

  it("is a no-op without a key", async () => {
    delete process.env.GEMINI_API_KEY;
    expect(await geminiJson("s", "u", {})).toEqual({ ok: false, error: "not_configured" });
  });

  it("parses the JSON text of the first candidate and sends the key as a header", async () => {
    process.env.GEMINI_API_KEY = "k";
    let sent: RequestInit | undefined;
    const fake = (async (_url: string, init: RequestInit) => {
      sent = init;
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"review":"ok","suggestions":[]}' }] } }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const out = await geminiJson<{ review: string }>("s", "u", {}, { fetchImpl: fake });
    expect(out).toMatchObject({ ok: true, data: { review: "ok" } });
    expect((sent?.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    expect(JSON.parse(String(sent?.body)).generationConfig.responseMimeType).toBe("application/json");
  });

  it("reports HTTP errors and bad JSON instead of throwing", async () => {
    process.env.GEMINI_API_KEY = "k";
    const http = (async () => new Response("quota", { status: 429 })) as unknown as typeof fetch;
    expect(await geminiJson("s", "u", {}, { fetchImpl: http })).toMatchObject({ ok: false, error: "request_failed" });
    const junk = (async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    expect(await geminiJson("s", "u", {}, { fetchImpl: junk })).toMatchObject({ ok: false, error: "bad_json" });
  });
});
