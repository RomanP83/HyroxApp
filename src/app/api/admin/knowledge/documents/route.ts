import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { operatorGuard } from "@/lib/adminAuth";
import { ingestDocument, KNOWLEDGE_BUCKET } from "@/lib/knowledge/store";

export const runtime = "nodejs";
// Reading a PDF end-to-end takes a while; the platform's plan caps this.
export const maxDuration = 300;

const Body = z.object({
  title: z.string().min(3).max(200),
  filename: z.string().min(1).max(200),
  // Raw base64 or a data: URL from the browser's FileReader.
  pdf_base64: z.string().min(100),
  license: z.enum(["own", "licensed", "research_only"]),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET(req: Request) {
  const denied = operatorGuard(req);
  if (denied) return denied;
  const admin = supabaseAdmin();

  const { data: docs, error } = await admin
    .from("knowledge_documents")
    .select("id, title, filename, storage_path, license, status, summary, error, bytes, uploaded_at, extracted_at")
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
  const paths = (docs ?? []).map((d) => d.storage_path);
  const signed = paths.length
    ? (await admin.storage.from(KNOWLEDGE_BUCKET).createSignedUrls(paths, 600)).data ?? []
    : [];
  const urlByPath = new Map(signed.map((s) => [s.path ?? "", s.signedUrl]));

  return NextResponse.json({
    documents: (docs ?? []).map((d) => ({
      ...d,
      pdf_url: urlByPath.get(d.storage_path) ?? null,
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

  const outcome = await ingestDocument(supabaseAdmin(), {
    title: body.title,
    filename: body.filename,
    pdfBase64: body.pdf_base64.replace(/^data:[^,]*,/, ""),
    license: body.license,
    notes: body.notes ?? null,
  });
  if ("error" in outcome && !("documentId" in outcome)) {
    return NextResponse.json({ error: outcome.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...outcome });
}
