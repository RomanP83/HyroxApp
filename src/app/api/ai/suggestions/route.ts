import { NextResponse } from "next/server";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { generateCoachSuggestions } from "@/lib/aiCoach";
import { geminiConfigured } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Review my training": Gemini reads the last weeks and proposes up to three
// changes; the engine filters them (src/lib/engine/suggestions.ts). Nothing
// in the plan changes here — applying is PATCH /api/ai/suggestions/[id].
export async function POST() {
  if (!geminiConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS: only the caller's own profile and plan come back.
  const { data: profile } = await supabase.from("athlete_profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("profile_id", profile.id)
    .in("status", ["active", "paused", "rehab"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: "no_plan" }, { status: 404 });

  const out = await generateCoachSuggestions(supabaseAdmin(), plan.id);
  if (!out.ok) return NextResponse.json({ error: out.error, detail: out.detail }, { status: 502 });
  return NextResponse.json({ ok: true, fresh: out.fresh, suggestion: out.row });
}
