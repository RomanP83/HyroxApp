import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { moveSession } from "@/lib/moveSession";

// Manual move/swap within the week (PP3 — high perceived control, low effort).
//
// The actual row work happens in the move_session RPC (migration 0022): it
// checks ownership, swaps with whatever already sits in the target half of the
// day, and keeps a logged session's status instead of overwriting it. Both
// rows change inside one transaction, which is why the unique constraint is
// deferrable. src/lib/moveSession.ts also records the day override and the
// audit row — shared with applied AI coach suggestions.
const Body = z.object({
  day_hint: z.number().int().min(1).max(7),
  /** Which half of the day; omit to keep the session where it is. */
  day_slot: z.enum(["am", "pm"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const out = await moveSession(supabase, params.id, parsed.data.day_hint, parsed.data.day_slot);
  if (!out.ok) {
    return NextResponse.json({ error: out.error, detail: out.detail }, { status: out.status });
  }
  if (!out.moved) return NextResponse.json({ ok: true, moved: false, reason: out.reason });
  return NextResponse.json({ ok: true, moved: true, swapped_with: out.swapped_with, reason: out.reason });
}
