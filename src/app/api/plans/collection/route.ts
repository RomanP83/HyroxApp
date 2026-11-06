import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { rebasePlan } from "@/lib/rebasePlan";
import { WORKOUT_COLLECTIONS } from "@/lib/engine";

export const runtime = "nodejs";

// Where session content comes from: the library, or the Verona collection
// (src/lib/engine/veronaWorkouts.ts). It changes the content of every
// remaining week, so — like the running volume — it goes through a rebase.
const Body = z.object({
  workout_collection: z.enum(WORKOUT_COLLECTIONS as [string, ...string[]]),
});

export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const collection = parsed.data.workout_collection;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile, error } = await supabase
    .from("athlete_profiles")
    .update({ workout_collection: collection })
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("profile_id", profile.id)
    .in("status", ["active", "paused"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) return NextResponse.json({ ok: true, rebased: false });

  const newPlanId = await rebasePlan(
    supabaseAdmin(),
    plan.id,
    collection === "verona"
      ? "Your sessions now come from the Verona plan wherever it has one — the remaining weeks were rebuilt."
      : "Your sessions come from the standard library again — the remaining weeks were rebuilt.",
  );
  return NextResponse.json({ ok: true, rebased: Boolean(newPlanId), planId: newPlanId });
}
