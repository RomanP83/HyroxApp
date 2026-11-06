// ============================================================================
// Swapping a station for something the gym actually has free.
//
// This writes a preference, not a plan change. The engine is untouched: the
// substitution is applied when a session is rendered, which is why it survives
// every rebuild without anything having to replay it, and why saving one never
// rebuilds a week.
// ============================================================================
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { findAlternative, STATIONS } from "@/lib/engine";

export const runtime = "nodejs";

const Body = z.object({
  station: z.enum(STATIONS as unknown as [string, ...string[]]),
  /** null clears the substitution and puts the station back. */
  alternative_slug: z.string().max(64).nullable(),
});

export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { station, alternative_slug } = parsed.data;

  // An unknown slug, or one belonging to a different station, would render as
  // nothing at all — reject it here rather than storing a silent no-op.
  if (alternative_slug) {
    const alt = findAlternative(alternative_slug);
    if (!alt || alt.station !== station) {
      return NextResponse.json({ error: "unknown_alternative" }, { status: 400 });
    }
  }

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select("id, station_substitutions")
    .eq("user_id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  const next = { ...((profile.station_substitutions as Record<string, string>) ?? {}) };
  if (alternative_slug) next[station] = alternative_slug;
  else delete next[station];

  const { error } = await supabase
    .from("athlete_profiles")
    .update({ station_substitutions: next })
    .eq("id", profile.id);
  if (error) {
    return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, station, alternative_slug });
}
