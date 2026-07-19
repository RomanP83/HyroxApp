// ============================================================================
// Engine tuning loader (Phase D2). Merges the engine_config row for the
// current ENGINE_VERSION over the compiled defaults — beta tuning becomes an
// UPDATE on that table instead of a deploy. Cached per server instance for a
// few minutes; a missing table/row silently falls back to the defaults, so
// the engine never blocks on config.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TUNING, ENGINE_VERSION, type EngineTuning } from "@/lib/engine";

const CACHE_TTL_MS = 5 * 60_000;

let cache: { at: number; tuning: EngineTuning } | null = null;

export async function loadTuning(client: SupabaseClient): Promise<EngineTuning> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.tuning;
  try {
    const { data } = await client
      .from("engine_config")
      .select("config")
      .eq("engine_version", ENGINE_VERSION)
      .maybeSingle();
    const tuning: EngineTuning = { ...DEFAULT_TUNING, ...((data?.config as object) ?? {}) };
    cache = { at: Date.now(), tuning };
    return tuning;
  } catch {
    return DEFAULT_TUNING;
  }
}

/** Test hook — clears the instance cache. */
export function resetTuningCache(): void {
  cache = null;
}
