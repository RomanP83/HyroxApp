import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

// The finish time the athlete is training for. Only the race analysis reads
// it (target splits, gap, readiness on /progress) — the plan engine does not,
// so a change here is a profile write, not a rebase.
const Body = z.object({
  target_time_sec: z.number().int().min(2400).max(14400).nullable(),
});

export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("athlete_profiles")
    .update({ target_time_sec: parsed.data.target_time_sec })
    .eq("user_id", user.id)
    .select("target_time_sec")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  return NextResponse.json({ ok: true, target_time_sec: data.target_time_sec });
}
