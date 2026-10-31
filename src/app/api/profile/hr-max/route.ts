import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { HR_MAX_MAX, HR_MAX_MIN } from "@/lib/atpt";

// The athlete's maximum heart rate. Nothing in the plan engine reads it — it
// only sets the heart-rate targets of the AT-PT trial on /benchmarks — so a
// change here is a profile write, not a rebase.
const Body = z.object({
  hr_max: z.number().int().min(HR_MAX_MIN).max(HR_MAX_MAX).nullable(),
});

export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS (ap_update) scopes the write to the caller's own profile.
  const { data, error } = await supabase
    .from("athlete_profiles")
    .update({ hr_max: parsed.data.hr_max })
    .eq("user_id", user.id)
    .select("hr_max")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "no_profile" }, { status: 404 });

  return NextResponse.json({ ok: true, hr_max: data.hr_max });
}
