// ============================================================================
// Ingestion glue: PDF in -> stored document + pending proposals.
// Service-role only (knowledge_* has RLS on and no policies), called from the
// CRON_SECRET-guarded /api/admin/knowledge routes.
// ============================================================================
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractFromPdf, MAX_PDF_BYTES, type KnowledgeLicense } from "./extract";
import type { Extraction } from "./schema";

export const KNOWLEDGE_BUCKET = "knowledge";

export interface IngestInput {
  title: string;
  filename: string;
  /** Raw PDF bytes, base64 encoded (data: prefixes are stripped by the route). */
  pdfBase64: string;
  license: KnowledgeLicense;
  notes?: string | null;
}

export interface IngestOutcome {
  documentId: string;
  status: "extracted" | "failed";
  summary: string | null;
  proposals: { block: number; tuning: number; principle: number };
  /** Proposals the model returned that failed validation and were dropped. */
  dropped?: number;
  error?: string;
}

export async function ingestDocument(
  admin: SupabaseClient,
  input: IngestInput,
): Promise<IngestOutcome | { error: string }> {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(input.pdfBase64, "base64");
  } catch {
    return { error: "pdf is not valid base64" };
  }
  if (!bytes.length) return { error: "pdf is empty" };
  if (bytes.length > MAX_PDF_BYTES) {
    return { error: `pdf is ${(bytes.length / 1024 / 1024).toFixed(1)} MB — the limit is 25 MB` };
  }
  // A PDF starts with %PDF- ; anything else is a wrong file, not a parse problem.
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { error: "file does not look like a PDF" };
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const { data: dupe } = await admin
    .from("knowledge_documents")
    .select("id, title")
    .eq("sha256", sha256)
    .maybeSingle();
  if (dupe) return { error: `this exact PDF is already in the library as "${dupe.title}"` };

  const storagePath = `${sha256}.pdf`;
  const upload = await admin.storage
    .from(KNOWLEDGE_BUCKET)
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (upload.error) return { error: `storage upload failed: ${upload.error.message}` };

  const { data: doc, error: insErr } = await admin
    .from("knowledge_documents")
    .insert({
      title: input.title,
      filename: input.filename,
      storage_path: storagePath,
      sha256,
      bytes: bytes.length,
      license: input.license,
      notes: input.notes ?? null,
      status: "uploaded",
    })
    .select("id")
    .single();
  if (insErr || !doc) return { error: `could not record the document: ${insErr?.message}` };

  // ── Extraction. A failure is recorded on the row, never thrown away. ──────
  let extraction: Extraction;
  let dropped = 0;
  try {
    const result = await extractFromPdf({
      pdfBase64: bytes.toString("base64"),
      title: input.title,
      license: input.license,
      notes: input.notes,
    });
    extraction = result.extraction;
    dropped = result.dropped;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown extraction error";
    await admin
      .from("knowledge_documents")
      .update({ status: "failed", error: message })
      .eq("id", doc.id);
    return {
      documentId: doc.id,
      status: "failed",
      summary: null,
      proposals: { block: 0, tuning: 0, principle: 0 },
      error: message,
    };
  }

  const rows = proposalRows(doc.id, extraction);
  if (rows.length) {
    const { error: propErr } = await admin.from("knowledge_proposals").insert(rows);
    if (propErr) {
      await admin
        .from("knowledge_documents")
        .update({ status: "failed", error: `proposal insert failed: ${propErr.message}` })
        .eq("id", doc.id);
      return {
        documentId: doc.id,
        status: "failed",
        summary: extraction.document_summary,
        proposals: { block: 0, tuning: 0, principle: 0 },
        error: propErr.message,
      };
    }
  }

  await admin
    .from("knowledge_documents")
    .update({
      status: "extracted",
      summary: extraction.document_summary,
      error: null,
      extracted_at: new Date().toISOString(),
    })
    .eq("id", doc.id);

  return {
    documentId: doc.id,
    status: "extracted",
    summary: extraction.document_summary,
    dropped,
    proposals: {
      block: extraction.blocks.length,
      tuning: extraction.tunings.length,
      principle: extraction.principles.length,
    },
  };
}

/** Flatten the three extraction lists into knowledge_proposals rows. */
export function proposalRows(documentId: string, extraction: Extraction) {
  const evidence = (p: { summary: string; rationale: string; quote: string; page: number; confidence: number }) => ({
    document_id: documentId,
    status: "pending" as const,
    summary: p.summary,
    rationale: p.rationale,
    quote: p.quote,
    page: p.page,
    confidence: p.confidence,
  });

  return [
    ...extraction.blocks.map((b) => ({ ...evidence(b), kind: "block" as const, payload: b })),
    ...extraction.tunings.map((t) => ({
      ...evidence(t),
      kind: "tuning" as const,
      payload: { key: t.key, value: t.value },
    })),
    ...extraction.principles.map((p) => ({
      ...evidence(p),
      kind: "principle" as const,
      payload: { topic: p.topic },
    })),
  ];
}

/** Short-lived link to the source PDF, so review is one click from the quote. */
export async function signedPdfUrl(
  admin: SupabaseClient,
  storagePath: string,
): Promise<string | null> {
  const { data } = await admin.storage.from(KNOWLEDGE_BUCKET).createSignedUrl(storagePath, 300);
  return data?.signedUrl ?? null;
}
