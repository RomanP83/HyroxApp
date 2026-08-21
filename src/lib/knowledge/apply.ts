// ============================================================================
// Apply a reviewed proposal to the two places the engine reads.
//
//   block   -> workout_blocks   (new library row; the fill layer picks it up
//                                on the next generation, no deploy)
//   tuning  -> engine_config    (one calibration key, merged over defaults)
//   principle -> nothing. Approving it records that the operator accepted the
//                note; it is research context, not an automatic change (§7).
//
// Every apply stores what it changed AND what was there before, so a tuning
// change stays revertible from the audit row alone.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TUNING, ENGINE_VERSION, type EngineTuning } from "@/lib/engine";
import { BlockProposalSchema, refineBlock, refineTuning } from "./schema";

export interface ProposalRow {
  id: string;
  kind: "block" | "tuning" | "principle";
  status: string;
  payload: Record<string, unknown>;
}

export type ApplyResult =
  | { ok: true; status: "applied" | "approved"; ref: Record<string, unknown> | null; before: Record<string, unknown> | null; message: string }
  | { ok: false; error: string };

export async function applyProposal(
  admin: SupabaseClient,
  proposal: ProposalRow,
): Promise<ApplyResult> {
  switch (proposal.kind) {
    case "block":
      return applyBlock(admin, proposal);
    case "tuning":
      return applyTuning(admin, proposal);
    case "principle":
      return {
        ok: true,
        status: "approved",
        ref: null,
        before: null,
        message: "Principle accepted — kept as research context, nothing applied automatically.",
      };
  }
}

async function applyBlock(admin: SupabaseClient, proposal: ProposalRow): Promise<ApplyResult> {
  const parsed = BlockProposalSchema.safeParse(proposal.payload);
  if (!parsed.success) return { ok: false, error: `payload is not a block proposal: ${parsed.error.message}` };

  const refined = refineBlock(parsed.data);
  if (!refined.ok) return { ok: false, error: refined.error };
  const row = refined.value;

  const { data: existing } = await admin
    .from("workout_blocks")
    .select("id")
    .eq("slug", row.slug)
    .maybeSingle();
  if (existing) return { ok: false, error: `a workout block with slug "${row.slug}" already exists` };

  const { data, error } = await admin.from("workout_blocks").insert(row).select("id").single();
  if (error) return { ok: false, error: `insert failed: ${error.message}` };

  return {
    ok: true,
    status: "applied",
    ref: { table: "workout_blocks", id: data.id, slug: row.slug },
    before: null,
    message: `Block "${row.slug}" is in the library — the generator can pick it from the next plan on.`,
  };
}

async function applyTuning(admin: SupabaseClient, proposal: ProposalRow): Promise<ApplyResult> {
  const refined = refineTuning(String(proposal.payload.key ?? ""), proposal.payload.value);
  if (!refined.ok) return { ok: false, error: refined.error };
  const { key, value } = refined.value;

  const { data: row } = await admin
    .from("engine_config")
    .select("config")
    .eq("engine_version", ENGINE_VERSION)
    .maybeSingle();

  const config = { ...((row?.config as Partial<EngineTuning>) ?? {}) };
  const current = (config[key] ?? DEFAULT_TUNING[key]) as number;
  if (current === value) {
    return { ok: false, error: `${key} is already ${value} — nothing to change` };
  }
  config[key] = value;

  const { error } = await admin
    .from("engine_config")
    .upsert(
      {
        engine_version: ENGINE_VERSION,
        config,
        notes: `Last change: ${key} ${current} -> ${value} (knowledge proposal ${proposal.id}).`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "engine_version" },
    );
  if (error) return { ok: false, error: `engine_config update failed: ${error.message}` };

  return {
    ok: true,
    status: "applied",
    ref: { engine_version: ENGINE_VERSION, key, value },
    before: { key, value: current },
    message: `${key}: ${current} → ${value}. Live for every plan within ~5 minutes (loadTuning cache).`,
  };
}
