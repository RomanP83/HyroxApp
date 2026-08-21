"use client";

// ============================================================================
// Operator surface for the knowledge pipeline (docs/knowledge-pipeline.md).
// Upload a PDF, read what the extractor proposes, approve or reject it. The
// operator secret (CRON_SECRET) is typed once and kept in sessionStorage —
// same shared secret as the crons and the KPI route, no second auth system.
// Not linked from the app and disallowed in robots.txt.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import { SparkIcon, SpinnerIcon, LockIcon, CheckIcon, SkipIcon } from "@/components/icons";

type License = "own" | "licensed" | "research_only";

interface DocumentRow {
  id: string;
  title: string;
  filename: string;
  license: License;
  status: string;
  summary: string | null;
  error: string | null;
  bytes: number;
  uploaded_at: string;
  pdf_url: string | null;
  proposals: { pending: number; total: number };
}

interface ProposalRow {
  id: string;
  kind: "block" | "tuning" | "principle";
  status: string;
  summary: string;
  rationale: string | null;
  quote: string | null;
  page: number | null;
  confidence: number | null;
  payload: Record<string, any>;
  reviewer_note: string | null;
  applied_before: Record<string, any> | null;
  knowledge_documents: { title: string; license: License };
}

const LICENSE_LABEL: Record<License, string> = {
  own: "own IP",
  licensed: "licensed",
  research_only: "research only",
};

export default function KnowledgeAdminPage() {
  const [secret, setSecret] = useState("");
  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [filter, setFilter] = useState("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("hh_operator_secret");
    if (stored) {
      setSecret(stored);
      setReady(true);
    }
  }, []);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          "content-type": "application/json",
          authorization: `Bearer ${secret}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
      return data;
    },
    [secret],
  );

  const refresh = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([
        call("/api/admin/knowledge/documents"),
        call(`/api/admin/knowledge/proposals?status=${filter}`),
      ]);
      setDocs(d.documents ?? []);
      setProposals(p.proposals ?? []);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "could not load");
    }
  }, [call, filter]);

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  async function upload(form: HTMLFormElement) {
    const data = new FormData(form);
    const file = data.get("pdf") as File | null;
    if (!file) return;
    setBusy("upload");
    setToast(`Reading "${file.name}" — extraction takes a moment.`);
    try {
      const base64 = await fileToBase64(file);
      const result = await call("/api/admin/knowledge/documents", {
        method: "POST",
        body: JSON.stringify({
          title: String(data.get("title") || file.name.replace(/\.pdf$/i, "")),
          filename: file.name,
          pdf_base64: base64,
          license: data.get("license"),
          notes: data.get("notes") || null,
        }),
      });
      if (result.status === "failed") {
        setToast(`Extraction failed: ${result.error}`);
      } else {
        const c = result.proposals;
        setToast(
          `Done — ${c.block} block(s), ${c.tuning} tuning change(s), ${c.principle} principle(s) waiting for review.`,
        );
      }
      form.reset();
      await refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function review(id: string, action: "approve" | "reject") {
    setBusy(id);
    try {
      const res = await call("/api/admin/knowledge/proposals", {
        method: "PATCH",
        body: JSON.stringify({ id, action }),
      });
      setToast(res.message ?? (action === "approve" ? "Applied." : "Rejected."));
      await refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "review failed");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!ready) {
    return (
      <main className="mx-auto max-w-sm space-y-4 pt-24">
        <div className="card space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <LockIcon size={18} className="text-accent" /> Operator access
          </div>
          <p className="text-xs text-muted">
            Enter the CRON_SECRET. It stays in this tab only.
          </p>
          <input
            className="input"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="CRON_SECRET"
          />
          <button
            className="btn-primary w-full"
            onClick={() => {
              sessionStorage.setItem("hh_operator_secret", secret);
              setReady(true);
            }}
          >
            Unlock
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Knowledge pipeline</h1>
          <p className="text-xs text-muted">
            PDFs become reviewed library blocks and calibration constants — never raw context at
            generation time.
          </p>
        </div>
        <button className="btn-ghost" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {/* ── Upload ─────────────────────────────────────────────────────── */}
      <form
        className="card space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void upload(e.currentTarget);
        }}
      >
        <div className="text-sm font-semibold">Add a document</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">PDF</label>
            <input className="input" type="file" name="pdf" accept="application/pdf" required />
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" name="title" placeholder="Taper meta-analysis (Bosquet 2007)" />
          </div>
          <div>
            <label className="label">Rights</label>
            <select className="input" name="license" defaultValue="research_only">
              <option value="research_only">Research only — principles &amp; constants</option>
              <option value="licensed">Licensed — blocks allowed</option>
              <option value="own">Own IP — blocks allowed</option>
            </select>
          </div>
          <div>
            <label className="label">Note for the extractor (optional)</label>
            <input className="input" name="notes" placeholder="Focus on the taper section" />
          </div>
        </div>
        <p className="text-xs text-muted">
          A third-party programme stays <b>research only</b>: it can never become a library block —
          principles are free, concrete plans are not.
        </p>
        <button className="btn-primary" disabled={busy === "upload"}>
          {busy === "upload" ? <SpinnerIcon size={16} /> : <SparkIcon size={16} />}
          Extract proposals
        </button>
      </form>

      {/* ── Documents ──────────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <div className="text-sm font-semibold">Documents ({docs.length})</div>
        {docs.length === 0 ? (
          <p className="text-xs text-muted">Nothing yet — the first PDF starts the library.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface2 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{d.title}</span>
                    <span className="pill">{LICENSE_LABEL[d.license]}</span>
                    {d.status === "failed" && <span className="pill text-warn">failed</span>}
                    {d.proposals.pending > 0 && (
                      <span className="pill text-accent2">{d.proposals.pending} pending</span>
                    )}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted">
                    {d.error ?? d.summary ?? "—"}
                  </div>
                </div>
                {d.pdf_url && (
                  <a className="btn-ghost" href={d.pdf_url} target="_blank" rel="noreferrer">
                    Open PDF
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Review queue ───────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Proposals</span>
          {["pending", "applied", "approved", "rejected", "failed", "all"].map((s) => (
            <button
              key={s}
              className={`chip ${filter === s ? "chip-active" : ""}`}
              onClick={() => setFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>

        {proposals.length === 0 ? (
          <div className="card text-xs text-muted">Nothing in this state.</div>
        ) : (
          proposals.map((p) => (
            <div key={p.id} className="card space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="pill text-accent2">{p.kind}</span>
                    <span className="font-semibold">{p.summary}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {p.knowledge_documents?.title}
                    {p.page != null && ` · page ${p.page}`}
                    {p.confidence != null && ` · confidence ${(p.confidence * 100).toFixed(0)}%`}
                  </div>
                </div>
                {p.status === "pending" || p.status === "failed" ? (
                  <div className="flex gap-2">
                    <button
                      className="btn-primary"
                      disabled={busy === p.id}
                      onClick={() => void review(p.id, "approve")}
                    >
                      {busy === p.id ? <SpinnerIcon size={16} /> : <CheckIcon size={16} />}
                      {p.kind === "principle" ? "Accept" : "Apply"}
                    </button>
                    <button
                      className="btn-ghost"
                      disabled={busy === p.id}
                      onClick={() => void review(p.id, "reject")}
                    >
                      <SkipIcon size={16} />
                      Reject
                    </button>
                  </div>
                ) : (
                  <span className="pill">{p.status}</span>
                )}
              </div>

              {p.rationale && <p className="text-sm text-muted">{p.rationale}</p>}
              {p.quote && (
                <blockquote className="border-l-2 border-accent/60 pl-3 text-sm italic text-muted">
                  “{p.quote}”
                </blockquote>
              )}
              {p.reviewer_note && <p className="text-xs text-warn">{p.reviewer_note}</p>}

              <PayloadView proposal={p} />
            </div>
          ))
        )}
      </div>

      {toast && (
        <div
          className="fixed bottom-4 left-1/2 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm shadow-lg"
          onClick={() => setToast(null)}
        >
          <SparkIcon size={14} className="shrink-0 text-accent2" />
          {toast}
        </div>
      )}
    </main>
  );
}

/** What exactly would change — the part the reviewer has to judge. */
function PayloadView({ proposal }: { proposal: ProposalRow }) {
  const p = proposal.payload ?? {};
  if (proposal.kind === "tuning") {
    const before = proposal.applied_before?.value;
    return (
      <div className="rounded-lg border border-line bg-surface2 p-3 font-mono text-xs">
        {String(p.key)}: {before != null ? `${before} → ` : ""}
        <span className="text-accent2">{String(p.value)}</span>
      </div>
    );
  }
  if (proposal.kind === "principle") {
    return <div className="pill">{String(p.topic ?? "principle")}</div>;
  }
  const content = Array.isArray(p.content) ? p.content : [];
  return (
    <div className="rounded-lg border border-line bg-surface2 p-3 text-xs">
      <div className="mb-2 flex flex-wrap gap-2">
        <span className="pill">{String(p.slug)}</span>
        <span className="pill">{String(p.block_type)}</span>
        {p.station && <span className="pill">{String(p.station)}</span>}
        <span className="pill">tier {String(p.difficulty_tier)}</span>
        <span className="pill">{String(p.equipment_variant)}</span>
        {(p.session_types ?? []).map((s: string) => (
          <span key={s} className="pill text-accent2">
            {s}
          </span>
        ))}
      </div>
      <ul className="space-y-1">
        {content.map((c: any, i: number) => (
          <li key={i}>
            • {c.exercise}
            {c.sets ? ` · ${c.sets}×` : ""}
            {c.reps ? `${c.reps}` : ""}
            {c.distance_m ? ` · ${c.distance_m} m` : ""}
            {c.rest_sec ? ` · rest ${c.rest_sec}s` : ""}
            {c.load_open ? ` · open ${c.load_open}` : ""}
            {c.load_pro ? ` · pro ${c.load_pro}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error("could not read the file"));
    reader.readAsDataURL(file);
  });
}
