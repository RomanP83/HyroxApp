// ============================================================================
// Ingestion glue: PDF in -> stored document + pending proposals.
// Service-role only (knowledge_* has RLS on and no policies), called from the
// CRON_SECRET-guarded /api/admin/knowledge routes.
// ============================================================================
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractFromPdf, extractFromText, MAX_PDF_BYTES } from "./extract";
import { parseExtractionPayload, type Extraction, type KnowledgeLicense } from "./schema";

export const KNOWLEDGE_BUCKET = "knowledge";

interface IngestCommon {
  title: string;
  license: KnowledgeLicense;
  notes?: string | null;
}

/**
 * Three ways in, one review queue:
 *   pdf       the model reads the file itself
 *   note      free text that was already summarised elsewhere (another AI, a
 *             coach's notes) — same extractor, no pages to cite
 *   proposals finished proposals in the app's JSON contract — validated and
 *             filed as-is, no model runs, no tokens spent
 */
export type IngestInput =
  | (IngestCommon & { kind: "pdf"; filename: string; pdfBase64: string })
  | (IngestCommon & { kind: "note"; text: string })
  | (IngestCommon & { kind: "proposals"; payload: unknown });

export interface IngestOutcome {
  documentId: string;
  status: "extracted" | "failed";
  summary: string | null;
  proposals: { block: number; tuning: number; principle: number };
  /** Proposals that failed validation and were dropped. */
  dropped?: number;
  /** Why they were dropped — only the ready-made-JSON path can be that precise. */
  rejected?: { list: string; index: number; error: string }[];
  error?: string;
}

export async function ingestDocument(
  admin: SupabaseClient,
  input: IngestInput,
): Promise<IngestOutcome | { error: string }> {
  switch (input.kind) {
    case "pdf":
      return ingestPdf(admin, input);
    case "note":
      return ingestNote(admin, input);
    case "proposals":
      return ingestProposals(admin, input);
  }
}

async function ingestPdf(
  admin: SupabaseClient,
  input: IngestCommon & { kind: "pdf"; filename: string; pdfBase64: string },
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
  const dupe = await findDuplicate(admin, sha256);
  if (dupe) return { error: dupe };

  const storagePath = `${sha256}.pdf`;
  const upload = await admin.storage
    .from(KNOWLEDGE_BUCKET)
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (upload.error) return { error: `storage upload failed: ${upload.error.message}` };

  const doc = await recordDocument(admin, {
    title: input.title,
    filename: input.filename,
    storage_path: storagePath,
    sha256,
    bytes: bytes.length,
    license: input.license,
    notes: input.notes ?? null,
    source_type: "pdf",
    body: null,
  });
  if ("error" in doc) return doc;

  return runAndStore(admin, doc.id, () =>
    extractFromPdf({
      pdfBase64: bytes.toString("base64"),
      title: input.title,
      license: input.license,
      notes: input.notes,
    }),
  );
}

async function ingestNote(
  admin: SupabaseClient,
  input: IngestCommon & { kind: "note"; text: string },
): Promise<IngestOutcome | { error: string }> {
  const text = input.text.trim();
  if (text.length < 40) return { error: "the note is too short to extract anything from" };

  const sha256 = createHash("sha256").update(text).digest("hex");
  const dupe = await findDuplicate(admin, sha256);
  if (dupe) return { error: dupe };

  const doc = await recordDocument(admin, {
    title: input.title,
    filename: `${input.title}.txt`,
    storage_path: null,
    sha256,
    bytes: Buffer.byteLength(text),
    license: input.license,
    notes: input.notes ?? null,
    source_type: "note",
    body: text,
  });
  if ("error" in doc) return doc;

  return runAndStore(admin, doc.id, () =>
    extractFromText({
      text,
      title: input.title,
      license: input.license,
      notes: input.notes,
    }),
  );
}

/**
 * Proposals that arrive finished. Nothing is generated: the payload is
 * validated against the same schema the extractor's output goes through, and
 * whatever fails comes back with a reason. A payload where everything fails is
 * refused outright rather than filed as an empty document.
 */
async function ingestProposals(
  admin: SupabaseClient,
  input: IngestCommon & { kind: "proposals"; payload: unknown },
): Promise<IngestOutcome | { error: string }> {
  const { extraction, rejected } = parseExtractionPayload(input.payload, input.license);
  const total = extraction.blocks.length + extraction.tunings.length + extraction.principles.length;
  if (!total) {
    const why = rejected.length
      ? rejected.slice(0, 3).map((r) => `${r.list}[${r.index}] ${r.error}`).join("; ")
      : "the payload contained no blocks, tunings or principles";
    return { error: `nothing to file — ${why}` };
  }

  const canonical = JSON.stringify(input.payload);
  const sha256 = createHash("sha256").update(canonical).digest("hex");
  const dupe = await findDuplicate(admin, sha256);
  if (dupe) return { error: dupe };

  const doc = await recordDocument(admin, {
    title: input.title,
    filename: `${input.title}.json`,
    storage_path: null,
    sha256,
    bytes: Buffer.byteLength(canonical),
    license: input.license,
    notes: input.notes ?? null,
    source_type: "proposals",
    body: canonical,
  });
  if ("error" in doc) return doc;

  const stored = await storeProposals(admin, doc.id, extraction);
  if (stored) return { ...stored, rejected };

  await admin
    .from("knowledge_documents")
    .update({
      status: "extracted",
      summary: extraction.document_summary || `${total} ready-made proposal(s) filed for review.`,
      error: null,
      extracted_at: new Date().toISOString(),
    })
    .eq("id", doc.id);

  return {
    documentId: doc.id,
    status: "extracted",
    summary: extraction.document_summary || null,
    dropped: rejected.length,
    rejected,
    proposals: {
      block: extraction.blocks.length,
      tuning: extraction.tunings.length,
      principle: extraction.principles.length,
    },
  };
}

// ── Shared plumbing ─────────────────────────────────────────────────────────

async function findDuplicate(admin: SupabaseClient, sha256: string): Promise<string | null> {
  const { data } = await admin
    .from("knowledge_documents")
    .select("title")
    .eq("sha256", sha256)
    .maybeSingle();
  return data ? `this exact source is already in the library as "${data.title}"` : null;
}

async function recordDocument(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await admin
    .from("knowledge_documents")
    .insert({ ...row, status: "uploaded" })
    .select("id")
    .single();
  if (error || !data) return { error: `could not record the source: ${error?.message}` };
  return { id: data.id };
}

/** Run an extraction and file what it returns; failures land on the row. */
async function runAndStore(
  admin: SupabaseClient,
  documentId: string,
  run: () => Promise<{ extraction: Extraction; dropped: number }>,
): Promise<IngestOutcome> {
  let extraction: Extraction;
  let dropped = 0;
  try {
    const result = await run();
    extraction = result.extraction;
    dropped = result.dropped;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown extraction error";
    await admin
      .from("knowledge_documents")
      .update({ status: "failed", error: message })
      .eq("id", documentId);
    return {
      documentId,
      status: "failed",
      summary: null,
      proposals: { block: 0, tuning: 0, principle: 0 },
      error: message,
    };
  }

  const failure = await storeProposals(admin, documentId, extraction);
  if (failure) return failure;

  await admin
    .from("knowledge_documents")
    .update({
      status: "extracted",
      summary: extraction.document_summary,
      error: null,
      extracted_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  return {
    documentId,
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

/** Insert the proposal rows; returns a failure outcome, or null on success. */
async function storeProposals(
  admin: SupabaseClient,
  documentId: string,
  extraction: Extraction,
): Promise<IngestOutcome | null> {
  const rows = proposalRows(documentId, extraction);
  if (!rows.length) return null;
  const { error } = await admin.from("knowledge_proposals").insert(rows);
  if (!error) return null;

  await admin
    .from("knowledge_documents")
    .update({ status: "failed", error: `proposal insert failed: ${error.message}` })
    .eq("id", documentId);
  return {
    documentId,
    status: "failed",
    summary: extraction.document_summary,
    proposals: { block: 0, tuning: 0, principle: 0 },
    error: error.message,
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
    page: p.page > 0 ? p.page : null,
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
