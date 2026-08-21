// ============================================================================
// Knowledge extraction — the contract between a PDF and the engine.
//
// The model returns three flat lists (no unions: strict JSON-schema output
// stays simple and parseable). Everything it may propose is expressed in the
// vocabulary the engine already speaks — workout_blocks rows and engine_config
// keys — so a reviewed proposal is a data change, never a code change.
//
// Two-stage validation on purpose: the MODEL-facing schema carries only types
// and enums (constraints the strict-output path handles reliably), and the
// refine* functions below apply the hard rules before anything is written.
//
// zod/v4 here because @anthropic-ai/sdk's zodOutputFormat helper is built
// against it (zod 3.25 ships the v4 API on that subpath). The rest of the app
// keeps the classic `zod` import.
// ============================================================================
import * as z from "zod/v4";
import type {
  BlockType,
  EngineTuning,
  EquipmentVariant,
  SessionType,
  Station,
} from "@/lib/engine";

// `satisfies` keeps these literal lists honest against the engine's unions.
const SESSION_TYPE_VALUES = [
  "run_easy",
  "run_intervals",
  "compromised_run",
  "strength",
  "station_work",
  "full_sim",
  "mobility",
  "benchmark",
] as const satisfies readonly SessionType[];

const STATION_VALUES = [
  "ski_erg",
  "sled_push",
  "sled_pull",
  "burpee_broad_jump",
  "row",
  "farmers_carry",
  "sandbag_lunges",
  "wall_balls",
  "run",
  "general",
] as const satisfies readonly Station[];

const BLOCK_TYPE_VALUES = ["warmup", "main", "mobility", "finisher"] as const satisfies readonly BlockType[];

const EQUIPMENT_VARIANT_VALUES = ["gym", "home"] as const satisfies readonly EquipmentVariant[];

const TUNING_KEYS = [
  "rpe_delta_up_threshold",
  "rpe_delta_down_threshold",
  "pace_step_sec_km",
  "pace_weekly_cap_pct",
  "pace_ref_window_days",
  "strength_step",
  "strength_modifier_min",
  "strength_modifier_max",
  "acwr_soft",
  "acwr_hard",
  "acwr_low",
  "acwr_soft_trim",
  "rpe_high_14d",
  "inactive_rebase_days",
] as const satisfies readonly (keyof EngineTuning)[];

export type TuningKey = (typeof TUNING_KEYS)[number];

/**
 * Sanity range per calibration constant. A study may move a number; it may not
 * move it somewhere that breaks the engine's guardrails (§5: one-step rule,
 * ±3% pace cap, ACWR thresholds). Out-of-range → the proposal is rejected at
 * apply time, not silently clamped.
 */
export const TUNING_BOUNDS: Record<TuningKey, [number, number]> = {
  rpe_delta_up_threshold: [-4, -1],
  rpe_delta_down_threshold: [1, 4],
  pace_step_sec_km: [1, 15],
  pace_weekly_cap_pct: [0.005, 0.1],
  pace_ref_window_days: [3, 28],
  strength_step: [0.01, 0.15],
  strength_modifier_min: [0.5, 1],
  strength_modifier_max: [1, 1.5],
  acwr_soft: [1.0, 1.6],
  acwr_hard: [1.1, 2.0],
  acwr_low: [0.4, 1.0],
  acwr_soft_trim: [0.5, 1.0],
  rpe_high_14d: [6, 10],
  inactive_rebase_days: [3, 28],
};

// ── Model-facing schemas ────────────────────────────────────────────────────

const EVIDENCE = {
  /** One line, shown in the review list. */
  summary: z.string(),
  /** Why the document supports this, in the extractor's own words. */
  rationale: z.string(),
  /** Verbatim snippet from the PDF — the reviewer's single lookup. */
  quote: z.string(),
  /** 1-indexed PDF page the quote sits on. */
  page: z.number().int(),
  /** 0..1 self-reported confidence. */
  confidence: z.number(),
};

const BlockContentItemSchema = z.object({
  exercise: z.string(),
  sets: z.number().int().nullable(),
  reps: z.number().int().nullable(),
  distance_m: z.number().int().nullable(),
  rest_sec: z.number().int().nullable(),
  /** Rendered load text per division, e.g. "2x24 kg" — null when not loaded. */
  load_open: z.string().nullable(),
  load_pro: z.string().nullable(),
});

export const BlockProposalSchema = z.object({
  ...EVIDENCE,
  slug: z.string(),
  block_type: z.enum(BLOCK_TYPE_VALUES),
  station: z.enum(STATION_VALUES).nullable(),
  equipment_variant: z.enum(EQUIPMENT_VARIANT_VALUES),
  difficulty_tier: z.number().int(),
  session_types: z.array(z.enum(SESSION_TYPE_VALUES)),
  tags: z.array(z.string()),
  content: z.array(BlockContentItemSchema),
});

export const TuningProposalSchema = z.object({
  ...EVIDENCE,
  key: z.enum(TUNING_KEYS),
  value: z.number(),
});

export const PrincipleProposalSchema = z.object({
  ...EVIDENCE,
  topic: z.string(),
});

export const ExtractionSchema = z.object({
  document_summary: z.string(),
  blocks: z.array(BlockProposalSchema),
  tunings: z.array(TuningProposalSchema),
  principles: z.array(PrincipleProposalSchema),
});

export type BlockProposal = z.infer<typeof BlockProposalSchema>;
export type TuningProposal = z.infer<typeof TuningProposalSchema>;
export type PrincipleProposal = z.infer<typeof PrincipleProposalSchema>;
export type Extraction = z.infer<typeof ExtractionSchema>;

// ── Hard rules, applied before anything is written ──────────────────────────

export interface WorkoutBlockRow {
  slug: string;
  block_type: BlockType;
  station: Station | null;
  content: Record<string, unknown>[];
  equipment_variant: EquipmentVariant;
  difficulty_tier: number;
  session_types: SessionType[];
  tags: string[];
}

export type Refined<T> = { ok: true; value: T } | { ok: false; error: string };

/** Library slugs from the pipeline are namespaced, so their origin stays obvious. */
export function knowledgeSlug(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base.startsWith("kb_") ? base : `kb_${base}`;
}

/** Turn a reviewed block proposal into a workout_blocks row (or refuse it). */
export function refineBlock(p: BlockProposal): Refined<WorkoutBlockRow> {
  const slug = knowledgeSlug(p.slug);
  if (slug.length < 6) return { ok: false, error: "slug too short after normalisation" };
  if (p.difficulty_tier < 1 || p.difficulty_tier > 3) {
    return { ok: false, error: `difficulty_tier ${p.difficulty_tier} outside 1..3` };
  }
  if (!p.session_types.length) return { ok: false, error: "no session_types" };
  if (!p.content.length) return { ok: false, error: "empty content" };
  if (p.content.length > 10) return { ok: false, error: "more than 10 content items" };

  const content = p.content.map((item) => {
    const row: Record<string, unknown> = { exercise: item.exercise.trim() };
    if (item.sets != null) row.sets = item.sets;
    if (item.reps != null) row.reps = item.reps;
    if (item.distance_m != null) row.distance_m = item.distance_m;
    if (item.rest_sec != null) row.rest_sec = item.rest_sec;
    const load: Record<string, string> = {};
    if (item.load_open) load.open = item.load_open;
    if (item.load_pro) load.pro = item.load_pro;
    if (Object.keys(load).length) row.load_by_division = load;
    return row;
  });
  if (content.some((c) => String(c.exercise).length < 3)) {
    return { ok: false, error: "content item without a usable exercise name" };
  }

  return {
    ok: true,
    value: {
      slug,
      block_type: p.block_type,
      station: p.station,
      content,
      equipment_variant: p.equipment_variant,
      difficulty_tier: p.difficulty_tier,
      session_types: p.session_types,
      tags: p.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 6),
    },
  };
}

/** A calibration change is only allowed on a known key, inside its bounds. */
export function refineTuning(key: string, value: unknown): Refined<{ key: TuningKey; value: number }> {
  if (!(TUNING_KEYS as readonly string[]).includes(key)) {
    return { ok: false, error: `unknown tuning key "${key}"` };
  }
  const k = key as TuningKey;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: `tuning value for ${k} is not a finite number` };
  }
  const [min, max] = TUNING_BOUNDS[k];
  if (value < min || value > max) {
    return { ok: false, error: `${k}=${value} outside the allowed range ${min}..${max}` };
  }
  return { ok: true, value: { key: k, value } };
}
