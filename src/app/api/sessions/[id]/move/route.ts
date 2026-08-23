import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";

// Manual move/swap within the week (PP3 — high perceived control, low effort).
//
// The actual row work happens in the move_session RPC (migration 0022): it
// checks ownership, swaps with whatever already sits in the target half of the
// day, and keeps a logged session's status instead of overwriting it. Both
// rows change inside one transaction, which is why the unique constraint is
// deferrable.
const Body = z.object({
  day_hint: z.number().int().min(1).max(7),
  /** Which half of the day; omit to keep the session where it is. */
  day_slot: z.enum(["am", "pm"]).optional(),
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
    .select("id, plan_id, day_hint, day_slot, title")
    .eq("id", sessionId)
    .single();
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const daySlot = parsed.data.day_slot ?? session.day_slot ?? "am";
  const { data: result, error } = await supabase.rpc("move_session", {
    p_session: sessionId,
    p_day: parsed.data.day_hint,
    p_slot: daySlot,
  });
  if (error) {
    const status = error.message.includes("not_authorized")
      ? 403
      : error.message.includes("not_found")
        ? 404
        : 500;
    return NextResponse.json({ error: "move_failed", detail: error.message }, { status });
  }

  const moved = (result ?? {}) as { moved?: boolean; swapped_with?: string | null };
  if (!moved.moved) {
    return NextResponse.json({ ok: true, moved: false, reason: "It is already there." });
  }

  const reason = moved.swapped_with
    ? `You swapped "${session.title}" with "${moved.swapped_with}". Life happens — the week bends, the plan doesn't break.`
    : `You moved "${session.title}" to day ${parsed.data.day_hint} (${daySlot.toUpperCase()}). Life happens — the week bends, the plan doesn't break.`;

  // Audit the manual move (service role — plan_adjustments is engine-owned).
  await supabaseAdmin().from("plan_adjustments").insert({
    plan_id: session.plan_id,
    layer: "micro",
    trigger: "manual_move",
    action_taken: {
      type: "move",
      session_id: sessionId,
      from_day: session.day_hint,
      from_slot: session.day_slot ?? "am",
      to_day: parsed.data.day_hint,
      to_slot: daySlot,
      swapped_with: moved.swapped_with ?? null,
    },
    reason,
  });

  return NextResponse.json({ ok: true, moved: true, swapped_with: moved.swapped_with ?? null, reason });
}
