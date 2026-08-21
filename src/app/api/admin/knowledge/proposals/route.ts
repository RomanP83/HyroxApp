import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { operatorGuard } from "@/lib/adminAuth";
import { applyProposal, type ProposalRow } from "@/lib/knowledge/apply";

export const runtime = "nodejs";

const Action = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(1000).nullable().optional(),
});

export async function GET(req: Request) {
  const denied = operatorGuard(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const documentId = url.searchParams.get("document");

  let query = supabaseAdmin()
    .from("knowledge_proposals")
    .select(
      "id, document_id, kind, status, summary, rationale, quote, page, confidence, payload, applied_at, applied_ref, applied_before, reviewer_note, created_at, knowledge_documents!inner(title, license, storage_path)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && status !== "all") query = query.eq("status", status);
  if (documentId) query = query.eq("document_id", documentId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ proposals: data ?? [] });
}

/**
 * Review one proposal. "approve" applies it right away (block -> library,
 * tuning -> engine_config); a principle is only marked accepted. An apply that
 * fails is parked as `failed` with the reason, so it stays visible and can be
 * fixed and approved again rather than disappearing.
 */
export async function PATCH(req: Request) {
  const denied = operatorGuard(req);
  if (denied) return denied;
  const parsed = Action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { id, action, note } = parsed.data;

  const admin = supabaseAdmin();
  const { data: proposal } = await admin
    .from("knowledge_proposals")
    .select("id, kind, status, payload")
    .eq("id", id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (action === "reject") {
    await admin
      .from("knowledge_proposals")
      .update({ status: "rejected", reviewer_note: note ?? null })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (proposal.status === "applied" || proposal.status === "approved") {
    return NextResponse.json({ error: "already reviewed" }, { status: 409 });
  }

  const result = await applyProposal(admin, proposal as ProposalRow);
  if (!result.ok) {
    await admin
      .from("knowledge_proposals")
      .update({ status: "failed", reviewer_note: result.error })
      .eq("id", id);
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  await admin
    .from("knowledge_proposals")
    .update({
      status: result.status,
      applied_at: new Date().toISOString(),
      applied_ref: result.ref,
      applied_before: result.before,
      reviewer_note: note ?? null,
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, status: result.status, message: result.message });
}
