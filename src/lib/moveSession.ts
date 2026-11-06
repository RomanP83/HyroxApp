// ============================================================================
// Move a session to another day / half of the day — shared by the manual move
// (PATCH /api/sessions/[id]/move) and an applied AI coach suggestion.
//
// The row work happens in the move_session RPC (migration 0022): it checks
// ownership, swaps with whatever already sits in the target half of the day,
// and keeps a logged session's status. It runs as the athlete, so the client
// passed in must be the user's, not the service role.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordDayOverrides, weekStartOf } from "@/lib/dayOverrides";

export type MoveOutcome =
  | { ok: true; moved: false; reason: string }
  | {
      ok: true;
      moved: true;
      reason: string;
      from_day: number;
      from_slot: "am" | "pm";
      swapped_with: string | null;
    }
  | { ok: false; status: number; error: string; detail?: string };

export async function moveSession(
  supabase: SupabaseClient,
  sessionId: string,
  dayHint: number,
  requestedSlot: "am" | "pm" | undefined,
  audit: {
    trigger: "manual_move" | "ai_suggestion";
    /** Replaces the default "You moved …" text in plan_adjustments. */
    reason?: (defaultReason: string) => string;
    extra?: Record<string, unknown>;
  } = { trigger: "manual_move" },
): Promise<MoveOutcome> {
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, plan_id, day_hint, day_slot, title, session_type, plan_weeks!inner(week_number), plans!inner(profile_id, starts_on)",
    )
    .eq("id", sessionId)
    .single();
  if (!session) return { ok: false, status: 404, error: "not_found" };

  const fromSlot = ((session.day_slot as "am" | "pm" | null) ?? "am") as "am" | "pm";
  const daySlot = requestedSlot ?? fromSlot;
  const { data: result, error } = await supabase.rpc("move_session", {
    p_session: sessionId,
    p_day: dayHint,
    p_slot: daySlot,
  });
  if (error) {
    const status = error.message.includes("not_authorized")
      ? 403
      : error.message.includes("not_found")
        ? 404
        : 500;
    return { ok: false, status, error: "move_failed", detail: error.message };
  }

  const moved = (result ?? {}) as {
    moved?: boolean;
    swapped_with?: string | null;
    swapped_with_type?: string | null;
  };
  if (!moved.moved) return { ok: true, moved: false, reason: "It is already there." };

  const defaultReason = moved.swapped_with
    ? `You swapped "${session.title}" with "${moved.swapped_with}". Life happens — the week bends, the plan doesn't break.`
    : `You moved "${session.title}" to day ${dayHint} (${daySlot.toUpperCase()}). Life happens — the week bends, the plan doesn't break.`;
  const reason = audit.reason ? audit.reason(defaultReason) : defaultReason;

  // Remember the decision against the CALENDAR week, so a later rebase can put
  // it back: plan week numbers shift when a plan is rebuilt, Mondays do not.
  const week = (session as unknown as { plan_weeks: { week_number: number } }).plan_weeks;
  const plan = (session as unknown as { plans: { profile_id: string; starts_on: string } }).plans;
  if (week && plan) {
    // Anchored on starts_on — the grid generatePlan replays overrides against.
    // Anchoring on generated_at filed every move on a plan built on any day
    // but Monday a week early, and the next rebase silently lost it.
    const weekStart = weekStartOf(plan.starts_on, week.week_number);
    const moves = [{ session_type: String(session.session_type), day_hint: dayHint, day_slot: daySlot }];
    // A swap moved two sessions; both sides are decisions worth keeping.
    if (moved.swapped_with_type) {
      moves.push({
        session_type: moved.swapped_with_type,
        day_hint: session.day_hint,
        day_slot: fromSlot,
      });
    }
    await recordDayOverrides(supabase, plan.profile_id, weekStart, moves);
  }

  // Audit the move (service role — plan_adjustments is engine-owned).
  await supabaseAdmin()
    .from("plan_adjustments")
    .insert({
      plan_id: session.plan_id,
      layer: "micro",
      trigger: audit.trigger,
      action_taken: {
        type: "move",
        session_id: sessionId,
        from_day: session.day_hint,
        from_slot: fromSlot,
        to_day: dayHint,
        to_slot: daySlot,
        swapped_with: moved.swapped_with ?? null,
        ...(audit.extra ?? {}),
      },
      reason,
    });

  return {
    ok: true,
    moved: true,
    reason,
    from_day: session.day_hint,
    from_slot: fromSlot,
    swapped_with: moved.swapped_with ?? null,
  };
}
