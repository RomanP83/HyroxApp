import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { operatorGuard } from "@/lib/adminAuth";
import { ingestDocument, KNOWLEDGE_BUCKET } from "@/lib/knowledge/store";

export const runtime = "nodejs";
// Reading a PDF end-to-end takes a while; the platform's plan caps this.
export const maxDuration = 300;

// Three source kinds share this route because they share everything after
// ingestion: the review queue, the apply path and the audit.
const Body = z.object({
  kind: z.enum(["pdf", "note", "proposals"]).default("pdf"),
  title: z.string().min(3).max(200),
  license: z.enum(["own", "licensed", "research_only"]),
  notes: z.string().max(2000).nullable().optional(),
  filename: z.string().min(1).max(200).optional(),
  /** kind=pdf — raw base64 or a data: URL from the browser's FileReader. */
  pdf_base64: z.string().min(100).optional(),
  /** kind=note — free text that was already summarised elsewhere. */
  text: z.string().min(40).max(120_000).optional(),
  /** kind=proposals — the app's JSON contract, as an object or pasted text. */
  proposals: z.union([z.string(), z.record(z.unknown())]).optional(),
});

export async function GET(req: Request) {
  const denied = operatorGuard(req);
  if (denied) return denied;
  const admin = supabaseAdmin();

  const { data: docs, error } = await admin
    .from("knowledge_documents")
    .select(
      "id, title, filename, storage_path, source_type, license, status, summary, error, bytes, uploaded_at, extracted_at",
    )
    .order("uploaded_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pending-proposal count per document — the only number the list really needs.
  const { data: pending } = await admin
    .from("knowledge_proposals")
    .select("document_id, status");
  const counts = new Map<string, { pending: number; total: number }>();
  for (const p of pending ?? []) {
    const c = counts.get(p.document_id) ?? { pending: 0, total: 0 };
    c.total += 1;
    if (p.status === "pending") c.pending += 1;
    counts.set(p.document_id, c);
  }

  // One batched call for the source links instead of one per row.
  const paths = (docs ?? []).map((d) => d.storage_path).filter((p): p is string => Boolean(p));
  const signed = paths.length
    ? (await admin.storage.from(KNOWLEDGE_BUCKET).createSignedUrls(paths, 600)).data ?? []
    : [];
  const urlByPath = new Map(signed.map((s) => [s.path ?? "", s.signedUrl]));

  return NextResponse.json({
    documents: (docs ?? []).map((d) => ({
      ...d,
      pdf_url: d.storage_path ? (urlByPath.get(d.storage_path) ?? null) : null,
      proposals: counts.get(d.id) ?? { pending: 0, total: 0 },
    })),
  });
}

export async function POST(req: Request) {
  const denied = operatorGuard(req);
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const body = parsed.data;

  const common = { title: body.title, license: body.license, notes: body.notes ?? null };

  let input;
  if (body.kind === "note") {
    if (!body.text) return NextResponse.json({ error: "text is required for a note" }, { status: 400 });
    input = { ...common, kind: "note" as const, text: body.text };
  } else if (body.kind === "proposals") {
    if (body.proposals == null) {
      return NextResponse.json({ error: "proposals are required" }, { status: 400 });
    }
    let payload: unknown = body.proposals;
    if (typeof payload === "string") {
      // Pasted JSON: a fenced answer from a chat window is still valid input.
      const cleaned = payload.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      try {
        payload = JSON.parse(cleaned);
      } catch {
        return NextResponse.json({ error: "the pasted proposals are not valid JSON" }, { status: 400 });
      }
    }
    input = { ...common, kind: "proposals" as const, payload };
  } else {
    if (!body.pdf_base64 || !body.filename) {
      return NextResponse.json({ error: "filename and pdf_base64 are required" }, { status: 400 });
    }
    input = {
      ...common,
      kind: "pdf" as const,
      filename: body.filename,
      pdfBase64: body.pdf_base64.replace(/^data:[^,]*,/, ""),
    };
  }

  const outcome = await ingestDocument(supabaseAdmin(), input);
  if ("error" in outcome && !("documentId" in outcome)) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...outcome });
}
