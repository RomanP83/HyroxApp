// ============================================================================
// Minimal Gemini client (server-only) — one structured-JSON call over REST.
//
// No SDK: a single generateContent request with a response schema is all the
// AI coach needs. Without GEMINI_API_KEY every caller gets null and the app
// carries on without the coach.
// ============================================================================

export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL;
}

export type GeminiResult<T> =
  | { ok: true; data: T; model: string }
  | { ok: false; error: "not_configured" | "request_failed" | "blocked" | "bad_json"; detail?: string };

/**
 * Ask Gemini for JSON matching `schema` (the OpenAPI subset Gemini accepts).
 * Never throws: every failure comes back as { ok: false }.
 */
export async function geminiJson<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<GeminiResult<T>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "not_configured" };
  const model = geminiModel();
  const doFetch = opts.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.4,
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
    });
  } catch (e) {
    return { ok: false, error: "request_failed", detail: (e as Error).message };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: "request_failed", detail: `${res.status} ${detail.slice(0, 300)}` };
  }

  const body = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  } | null;
  if (body?.promptFeedback?.blockReason) {
    return { ok: false, error: "blocked", detail: body.promptFeedback.blockReason };
  }
  const text = (body?.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) return { ok: false, error: "blocked", detail: body?.candidates?.[0]?.finishReason };

  try {
    return { ok: true, data: JSON.parse(text) as T, model };
  } catch {
    return { ok: false, error: "bad_json", detail: text.slice(0, 200) };
  }
}
