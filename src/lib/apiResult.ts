// ============================================================================
// Reading an API response without assuming it is JSON.
//
// `await res.json()` on a body that is not JSON throws "Unexpected end of JSON
// input" — and that message then replaces the real failure, which is the one
// thing the person needed to see. A route that crashes returns a 500 with an
// empty or HTML body, so every caller has to survive that.
// ============================================================================

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  /** Ready to show: the server's own message, or what actually went wrong. */
  message: string;
}

/**
 * Parse a response defensively. On success the JSON body comes back as data;
 * on failure the message is the server's `detail`/`error` when it sent one,
 * and otherwise says what the status was and that the body was not JSON —
 * which is what points at a crashed route rather than a rejected request.
 */
export async function readApi<T = Record<string, unknown>>(res: Response): Promise<ApiResult<T>> {
  const text = await res.text().catch(() => "");
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }

  if (data && typeof data === "object") {
    const body = data as Record<string, unknown>;
    const stated =
      typeof body.detail === "string"
        ? body.detail
        : typeof body.error === "string"
          ? body.error
          : null;
    if (res.ok) return { ok: true, status: res.status, data, message: stated ?? "" };
    return { ok: false, status: res.status, data, message: stated ?? `Request failed (${res.status}).` };
  }

  // No JSON at all: the route did not answer, it fell over.
  return {
    ok: false,
    status: res.status,
    data: {} as T,
    message: res.ok
      ? "The server replied with an empty response."
      : `Something broke on the server (${res.status}). ${
          text.trim() ? "" : "It returned no message — check the server logs."
        }`.trim(),
  };
}
