// ============================================================================
// The brief an external AI needs so its output lands in this app unchanged.
//
// The pipeline accepts finished proposals as JSON (source_type 'proposals') —
// no model runs on our side, nothing is re-interpreted. For that to work, the
// other side has to know the exact contract, so it is generated here from the
// same constants the validator uses. One source of truth: when a tuning key or
// a session type changes, the brief changes with it.
// ============================================================================
import {
  BLOCK_TYPE_VALUES,
  EQUIPMENT_VARIANT_VALUES,
  SESSION_TYPE_VALUES,
  STATION_VALUES,
  TUNING_BOUNDS,
  TUNING_KEYS,
} from "./schema";

const EXAMPLE = {
  document_summary: "One or two sentences on what this source is and what it argues.",
  blocks: [
    {
      summary: "Sled push intervals at race load",
      rationale: "Why this block follows from the source, in one or two sentences.",
      quote: "A short verbatim snippet from the source that supports it.",
      page: 0,
      confidence: 0.7,
      slug: "sled_push_intervals",
      block_type: "main",
      station: "sled_push",
      equipment_variant: "gym",
      difficulty_tier: 2,
      session_types: ["station_work"],
      tags: ["sled", "legs"],
      content: [
        {
          exercise: "Sled push 25 m",
          sets: 5,
          reps: null,
          distance_m: 25,
          rest_sec: 90,
          load_open: "102 kg",
          load_pro: "152 kg",
        },
      ],
    },
  ],
  tunings: [
    {
      summary: "Lower the hard ACWR ceiling",
      rationale: "Why the source supports this exact number.",
      quote: "risk increased sharply above an acute:chronic ratio of 1.4",
      page: 12,
      confidence: 0.6,
      key: "acwr_hard",
      value: 1.4,
    },
  ],
  principles: [
    {
      summary: "Taper: cut volume, hold intensity",
      rationale: "Why this matters for how the plan is explained or built.",
      quote: "reductions of 41-60% produced the largest gains",
      page: 3,
      confidence: 0.9,
      topic: "taper",
    },
  ],
};

/**
 * A self-contained prompt: paste it into any AI together with the study or
 * article, and its answer can be pasted straight into the app's "ready-made
 * proposals" box.
 */
export function knowledgeBrief(): string {
  const tuning = TUNING_KEYS.map((k) => {
    const [min, max] = TUNING_BOUNDS[k];
    return `  ${k} (${min} … ${max})`;
  }).join("\n");

  return `You are preparing input for a Hyrox training platform whose plan engine is deterministic.
Read the source I give you and answer with ONE JSON object — no prose, no code fence — in exactly the shape below. A human reviews every item before anything is applied, so precision matters more than volume. Empty lists are a correct answer; never pad.

There are exactly three kinds of proposal, because the engine reads exactly two things plus its explanations:

1. "blocks" — new entries for the workout-block library the generator picks sessions from.
2. "tunings" — a single calibration constant of the adaptive engine.
3. "principles" — a finding worth knowing that is neither of the above.

COPYRIGHT RULE (absolute): training principles are free, a published programme is not. Never reproduce a source's session, week or block as written, and never lift its wording. Take the principle and formulate the block independently. If a block cannot be written without following the source's specific programme, propose the principle instead.

EVIDENCE on every item:
  quote       a short verbatim snippet from the source (max ~40 words)
  page        1-indexed PDF page the quote is on; 0 when the source has no pages. Never guess.
  confidence  0..1, honest. Below 0.5 means "worth a look", not "do it".
  rationale   one or two sentences on why this follows from the source.

ALLOWED VALUES
  block_type: ${BLOCK_TYPE_VALUES.join(" | ")}
  equipment_variant: ${EQUIPMENT_VARIANT_VALUES.join(" | ")}   ("home" only when it needs no gym equipment)
  difficulty_tier: 1 (accessible) | 2 (standard) | 3 (advanced)
  session_types (one or more): ${SESSION_TYPE_VALUES.join(" | ")}
  station (or null): ${STATION_VALUES.join(" | ")}
  content items: exercise (text) plus sets, reps, distance_m, rest_sec, load_open, load_pro — use null for the ones that do not apply. "open" is the standard division, "pro" the heavier one.
  slug: short snake_case, describing the block.

  tuning keys, with the range each one must stay inside:
${tuning}
  Report a single value, never a range. If the source supports only a direction, make it a principle.

SHAPE (types matter; keys that do not apply are null, not missing):
${JSON.stringify(EXAMPLE, null, 2)}`;
}
