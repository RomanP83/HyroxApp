import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

// Manual move/swap within the week (PP3 — high perceived control, low effort).
const Body = z.object({
  day_hint: z.number().int().min(1).max(7),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const sessionId = params.id;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: session } = await supabase
    .from("sessions")
    .select("id, plan_id, day_hint, title")
    .eq("id", sessionId)
    .single();
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { error } = await supabase
    .from("sessions")
    .update({ day_hint: parsed.data.day_hint, status: "moved" })
    .eq("id", sessionId);
  if (error) return NextResponse.json({ error: "move_failed", detail: error.message }, { status: 500 });

  // Audit the manual move (service role — plan_adjustments is engine-owned).
  await supabaseAdmin().from("plan_adjustments").insert({
    plan_id: session.plan_id,
    layer: "micro",
    trigger: "manual_move",
    action_taken: { type: "move", session_id: sessionId, from_day: session.day_hint, to_day: parsed.data.day_hint },
    reason: `You moved "${session.title}" to day ${parsed.data.day_hint}. Life happens — the week bends, the plan doesn't break.`,
  });

  return NextResponse.json({ ok: true });
}
