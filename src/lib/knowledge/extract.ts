// ============================================================================
// PDF -> proposals. The PDF goes to Claude as a `document` content block
// (base64, no parser dependency, no beta header) and comes back as strict
// structured output — three flat lists in the engine's own vocabulary.
//
// What this deliberately does NOT do: put document text anywhere near plan
// generation. The engine reads workout_blocks and engine_config, both of which
// only ever change through a reviewed proposal (docs/knowledge-pipeline.md).
//
// Citations note: the API's `citations` feature is incompatible with
// output_config.format (400), so evidence rides in the schema instead — the
// model reports `quote` + `page` per proposal, and the reviewer checks them
// against the PDF that is one click away in the admin UI.
// ============================================================================
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  BlockProposalSchema,
  ExtractionSchema,
  PrincipleProposalSchema,
  TUNING_BOUNDS,
  TuningProposalSchema,
  type Extraction,
  type KnowledgeLicense,
} from "./schema";

export type { KnowledgeLicense };

/** 32 MB is the API's request ceiling; stay under it with room for the JSON. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

let cached: Anthropic | null = null;

function anthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cached) cached = new Anthropic();
  return cached;
}

const TUNING_LIST = Object.entries(TUNING_BOUNDS)
  .map(([key, [min, max]]) => `  - ${key} (allowed ${min}..${max})`)
  .join("\n");

const SYSTEM = `You are the research assistant of a Hyrox training platform. You read one source (a study, a review paper, an article, a training programme, or a summary somebody else already produced) and propose concrete, reviewable changes to the platform's own training system. A human reviews every proposal before anything is applied.

The platform's plan engine is deterministic. It reads exactly two things you can influence:
1. A workout-block library (its own IP) that the generator picks sessions from.
2. A set of calibration constants for the adaptive engine.

Propose only what the document actually supports. An empty list is a correct answer — never pad.

## blocks — new library entries
A block is one self-contained piece of a session: warmup, main, mobility or finisher, with exercises, sets/reps or distance, rest, and load per division ("open" is the standard division, "pro" the heavier one).
COPYRIGHT RULE — this one is absolute: training PRINCIPLES are free, a published PROGRAMME is not. Never reproduce a document's session, week, or block as written, and never lift its wording. Take the underlying principle and formulate a block independently, in your own words, in the platform's structure. If a block cannot be written without following the source's specific programme, do not propose it — propose the principle instead.
Choose session_types from the ones the block genuinely fits, a difficulty_tier of 1 (accessible), 2 (standard) or 3 (advanced), and equipment_variant "home" only when it needs no gym equipment.
Give each block a short snake_case slug describing it, e.g. "sled_push_intervals".

## tunings — calibration constants
Only propose one of these keys, and only when the document gives a defensible number:
${TUNING_LIST}
Report the proposed value, never a range. If the document only supports a direction and no number, make it a principle instead.

## principles — research notes
Anything the platform should know but cannot express as a block or a constant: periodisation findings, taper evidence, injury-risk thresholds, pacing research. These are notes for the operator; they are never applied automatically.

## Evidence, on every single proposal
- quote: a short verbatim snippet from the source that supports it (max ~40 words).
- page: the 1-indexed PDF page that quote is on. Never guess a page. For a source without pages, use 0.
- confidence: 0..1, honest. Below 0.5 means "worth a look", not "do it".
- rationale: one or two sentences on why this follows from the document.

Answer with the JSON object only — no prose around it.`;

export interface ExtractResult {
  extraction: Extraction;
  /** Proposals the model returned that failed validation and were dropped. */
  dropped: number;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Validate each proposal on its own instead of parsing the whole payload
 * all-or-nothing. The SDK's schema transform demotes enums to descriptions,
 * so the API constrains the shape but does not hard-enforce every value — one
 * stray station name must not throw away a 40-page extraction.
 */
function collect<T>(
  input: unknown,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
): { items: T[]; dropped: number } {
  if (!Array.isArray(input)) return { items: [], dropped: 0 };
  const items: T[] = [];
  let dropped = 0;
  for (const raw of input) {
    const parsed = schema.safeParse(raw);
    if (parsed.success && parsed.data) items.push(parsed.data);
    else dropped += 1;
  }
  return { items, dropped };
}

/** The model is told to answer with JSON only; tolerate a fenced answer anyway. */
function parseJsonPayload(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(cleaned.slice(start, end + 1));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Read one source and return proposals. Throws with a readable message — the
 * caller records it on the document row so a failed extraction is visible in
 * the admin UI instead of silently producing nothing.
 */
async function runExtraction(opts: {
  content: Anthropic.ContentBlockParam[];
  title: string;
  license: KnowledgeLicense;
  notes?: string | null;
  /** Extra instruction for the source kind (e.g. "no pages in this one"). */
  sourceHint?: string;
}): Promise<ExtractResult> {
  const client = anthropic();
  if (!client) throw new Error("ANTHROPIC_API_KEY is not configured");

  // §7 as a hard gate, not a hope: a source we hold no rights to can only
  // ever yield principles and calibration numbers, never library blocks.
  const licenceLine =
    opts.license === "research_only"
      ? `LICENCE: research_only. Do NOT propose any blocks for this source — return an empty "blocks" list. Principles and tunings only.`
      : `LICENCE: ${opts.license}. Blocks are allowed, but the copyright rule above still applies in full.`;

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    output_config: { format: zodOutputFormat(ExtractionSchema) },
    messages: [
      {
        role: "user",
        content: [
          ...opts.content,
          {
            type: "text",
            text: [
              `Source title: ${opts.title}`,
              licenceLine,
              opts.sourceHint,
              opts.notes ? `Operator note: ${opts.notes}` : null,
              "Extract proposals as specified.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("extraction refused by the model");

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const payload = parseJsonPayload(text);
  if (!payload) throw new Error("extraction returned no parseable JSON");

  const blocks = collect(payload.blocks, BlockProposalSchema);
  const tunings = collect(payload.tunings, TuningProposalSchema);
  const principles = collect(payload.principles, PrincipleProposalSchema);

  const extraction: Extraction = {
    document_summary:
      typeof payload.document_summary === "string" ? payload.document_summary : "",
    // Belt and braces: the licence gate is in the prompt, and again here.
    blocks: opts.license === "research_only" ? [] : blocks.items,
    tunings: tunings.items,
    principles: principles.items,
  };
  // Shape check on the assembled result — a no-op unless the schema drifts.
  ExtractionSchema.parse(extraction);

  return {
    extraction,
    dropped: blocks.dropped + tunings.dropped + principles.dropped,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

/** A PDF, read by the model itself (no parser in between). */
export function extractFromPdf(opts: {
  pdfBase64: string;
  title: string;
  license: KnowledgeLicense;
  notes?: string | null;
}): Promise<ExtractResult> {
  return runExtraction({
    title: opts.title,
    license: opts.license,
    notes: opts.notes,
    content: [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: opts.pdfBase64 },
        title: opts.title,
      },
    ],
  });
}

/** Longest text a single note may carry (~40k tokens of input). */
export const MAX_NOTE_CHARS = 120_000;

/**
 * Free text that was already read and analysed elsewhere — an AI summary, a
 * coach's notes, a digest of several studies. Same extractor, same schema,
 * same review queue; only the input differs, and there are no page numbers to
 * anchor the evidence to.
 */
export function extractFromText(opts: {
  text: string;
  title: string;
  license: KnowledgeLicense;
  notes?: string | null;
}): Promise<ExtractResult> {
  const text = opts.text.trim();
  if (text.length < 40) throw new Error("the note is too short to extract anything from");
  if (text.length > MAX_NOTE_CHARS) {
    throw new Error(`the note is ${text.length} characters — the limit is ${MAX_NOTE_CHARS}`);
  }
  return runExtraction({
    title: opts.title,
    license: opts.license,
    notes: opts.notes,
    sourceHint:
      "This source is plain text that someone (often another AI) already summarised — it has no pages. Report page 0 and quote the sentence you are relying on. Treat its claims as second-hand: when it names a study, a number or a mechanism, that is what you cite; when it only asserts something, lower your confidence accordingly.",
    content: [{ type: "text", text }],
  });
}
