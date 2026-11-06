import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { intensityStep } from "@/lib/engine";
import { moveSession } from "@/lib/moveSession";
import type { StoredSuggestion, SuggestionRow } from "@/lib/aiCoach";

// The athlete's answer to one AI coach suggestion: apply it, dismiss it, or
// undo an applied one. This is the ONLY place a suggestion touches the plan,
// and it goes through the same paths as a manual change: a move runs the
// move_session RPC as the athlete (with its day override), an easier/harder
// step is recomputed by the engine from the session as it is now, and every
// change is audited in plan_adjustments with the trigger 'ai_suggestion'.
const Body = z.object({
  item_id: z.string().min(1).max(10),
  op: z.enum(["apply", "dismiss", "undo"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: suggestionId } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { item_id, op } = parsed.data;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS (ais_select) returns the row only to its owner.
  const { data: rowData } = await supabase.from("ai_suggestions").select("*").eq("id", suggestionId).maybeSingle();
  if (!rowData) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const row = rowData as SuggestionRow;
  const items = (row.items ?? []) as StoredSuggestion[];
  const item = items.find((i) => i.id === item_id);
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = supabaseAdmin();
  const save = async (next: StoredSuggestion) => {
    const updated = items.map((i) => (i.id === item_id ? next : i));
    await admin.from("ai_suggestions").update({ items: updated }).eq("id", row.id);
    return next;
  };
  const audit = (reason: string, extra: Record<string, unknown> = {}) =>
    admin.from("plan_adjustments").insert({
      plan_id: row.plan_id,
      layer: "micro",
      trigger: "ai_suggestion",
      action_taken: {
        type: "ai_suggestion",
        op,
        action: item.action,
        session_id: item.session_id,
        suggestion_id: row.id,
        item_id,
        ...extra,
      },
      reason,
    });

  if (op === "dismiss") {
    if (item.status !== "open") return NextResponse.json({ error: "not_open" }, { status: 409 });
    const next = await save({ ...item, status: "dismissed" });
    return NextResponse.json({ ok: true, item: next, reason: "Dismissed — the plan stays as it is." });
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("id, title, status, intensity_rpe_target, planned_duration_min")
    .eq("id", item.session_id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: "session_gone" }, { status: 409 });

  if (op === "apply") {
    if (item.status !== "open") return NextResponse.json({ error: "not_open" }, { status: 409 });
    if (session.status !== "planned") {
      return NextResponse.json({ error: "session_no_longer_planned" }, { status: 409 });
    }

    if (item.action === "move") {
      const out = await moveSession(supabase, session.id, item.day_hint as number, item.day_slot, {
        trigger: "ai_suggestion",
        reason: () => `Coach suggestion applied: "${session.title}" ${item.change}. ${item.reason}`,
        extra: { suggestion_id: row.id, item_id },
      });
      if (!out.ok) return NextResponse.json({ error: out.error, detail: out.detail }, { status: out.status });
      const next = await save({
        ...item,
        status: "applied",
        applied_at: new Date().toISOString(),
        undo: out.moved ? { day_hint: out.from_day, day_slot: out.from_slot } : undefined,
      });
      return NextResponse.json({ ok: true, item: next, reason: out.reason });
    }

    if (item.action === "skip") {
      await supabase.from("sessions").update({ status: "skipped" }).eq("id", session.id);
      const reason = `Coach suggestion applied: "${session.title}" left out. ${item.reason}`;
      await audit(reason);
      const next = await save({ ...item, status: "applied", applied_at: new Date().toISOString(), undo: { status: "planned" } });
      return NextResponse.json({ ok: true, item: next, reason });
    }

    // easier / harder — recomputed from the session as it stands now, so a
    // change made since the suggestion was written is stepped from, not lost.
    const step = intensityStep(session, item.action);
    await supabase
      .from("sessions")
      .update({ intensity_rpe_target: step.rpe, planned_duration_min: step.duration })
      .eq("id", session.id);
    const reason = `Coach suggestion applied: "${session.title}" RPE ${session.intensity_rpe_target} → ${step.rpe}, ${session.planned_duration_min} → ${step.duration} min. ${item.reason}`;
    await audit(reason, { rpe_from: session.intensity_rpe_target, rpe_to: step.rpe });
    const next = await save({
      ...item,
      status: "applied",
      applied_at: new Date().toISOString(),
      undo: { rpe: session.intensity_rpe_target, duration: session.planned_duration_min },
    });
    return NextResponse.json({ ok: true, item: next, reason });
  }

  // ── undo ────────────────────────────────────────────────────────────────
  if (item.status !== "applied") return NextResponse.json({ error: "not_applied" }, { status: 409 });
  const undo = item.undo ?? {};

  if (item.action === "move") {
    if (undo.day_hint) {
      const out = await moveSession(supabase, session.id, undo.day_hint, undo.day_slot, {
        trigger: "ai_suggestion",
        reason: () => `Coach suggestion undone: "${session.title}" is back where it was.`,
        extra: { suggestion_id: row.id, item_id, undo: true },
      });
      if (!out.ok) return NextResponse.json({ error: out.error, detail: out.detail }, { status: out.status });
    }
  } else if (item.action === "skip") {
    if (session.status !== "skipped") return NextResponse.json({ error: "session_changed_since" }, { status: 409 });
    await supabase.from("sessions").update({ status: "planned" }).eq("id", session.id);
    await audit(`Coach suggestion undone: "${session.title}" is back in the week.`);
  } else {
    if (session.status !== "planned" || undo.rpe == null || undo.duration == null) {
      return NextResponse.json({ error: "session_changed_since" }, { status: 409 });
    }
    await supabase
      .from("sessions")
      .update({ intensity_rpe_target: undo.rpe, planned_duration_min: undo.duration })
      .eq("id", session.id);
    await audit(`Coach suggestion undone: "${session.title}" back to RPE ${undo.rpe}, ${undo.duration} min.`);
  }

  const next = await save({ ...item, status: "open", applied_at: undefined, undo: undefined });
  return NextResponse.json({ ok: true, item: next, reason: "Undone — the session is as it was." });
}
