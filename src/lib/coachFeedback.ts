// ============================================================================
// AI coach text (server-only) — Trainingsfeedback after a logged session.
// The engine computes ALL numbers, verdicts and the fulfillment index
// deterministically (src/lib/engine/feedback.ts). Claude only rewrites the
// coach message in a warmer, personal voice from those fixed facts — it never
// invents metrics. Without ANTHROPIC_API_KEY the deterministic text ships
// as-is, so the feature degrades gracefully (same pattern as weekly_goal).
// ============================================================================
import Anthropic from "@anthropic-ai/sdk";
import type { SessionFeedback, FeedbackInput } from "@/lib/engine";

let cached: Anthropic | null = null;

function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cached) cached = new Anthropic();
  return cached;
}

const SYSTEM = `You are the in-app coach of a Hyrox training platform. After each logged session the app shows a short "training feedback" card. You receive the session's computed metrics (actual vs. planned, verdicts, fulfillment score) and a deterministic draft text.

Rewrite the draft as a 3-4 sentence coach message. Rules:
- Use ONLY the numbers and verdicts provided. Never invent metrics, paces, or claims.
- Address the athlete directly ("you"). Encouraging but honest — name the biggest deviation plainly, credit what was on target.
- End with one concrete, forward-looking cue tied to the deviation (e.g. build duration gradually, hold back on easy days).
- No medical advice, no emojis, no headings, no lists. Plain prose only.`;

/**
 * Rephrase the deterministic coach text with Claude. Returns the feedback
 * object with `coachText` replaced and `aiGenerated: true` on success;
 * returns it unchanged on any failure or when no API key is configured.
 */
export async function enrichFeedbackWithAI(
  feedback: SessionFeedback,
  input: FeedbackInput,
): Promise<SessionFeedback> {
  const client = anthropic();
  if (!client) return feedback;

  const facts = {
    session_type: input.sessionType,
    session_title: input.sessionTitle,
    fulfillment_score: feedback.score,
    headline: feedback.headline,
    metrics: feedback.metrics.map((m) => ({
      metric: m.label,
      actual: m.actual,
      planned: m.target,
      unit: m.unit,
      verdict: m.badge,
    })),
    draft_text: feedback.coachText,
  };

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(facts) }],
    });

    if (response.stop_reason === "refusal") return feedback;
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    if (!text) return feedback;
    return { ...feedback, coachText: text, aiGenerated: true };
  } catch {
    // Any API failure (rate limit, network, bad key) → deterministic fallback.
    return feedback;
  }
}
