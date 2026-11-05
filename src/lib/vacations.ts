// ============================================================================
// The athlete's vacations, in engine shape. Read by every path that builds a
// plan (onboarding, season, rebase) and by the nightly guardrail. A database
// without migration 0032 answers with an error: then there are none.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vacation } from "@/lib/engine";

export async function loadVacations(supabase: SupabaseClient, profileId: string): Promise<Vacation[]> {
  const { data, error } = await supabase
    .from("vacations")
    .select("starts_on, ends_on, mode")
    .eq("profile_id", profileId)
    .order("starts_on");
  if (error || !data) return [];
  return data.map((v: { starts_on: string; ends_on: string; mode: string }) => ({
    start: String(v.starts_on).slice(0, 10),
    end: String(v.ends_on).slice(0, 10),
    mode: v.mode === "off" ? "off" : "maintain",
  }));
}
