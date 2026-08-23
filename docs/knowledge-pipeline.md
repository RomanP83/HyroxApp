# Knowledge pipeline — how PDFs reach the plan

**Status:** implemented — `supabase/migrations/0011_knowledge_pipeline.sql` +
`0013_knowledge_text_sources.sql`, `src/lib/knowledge/**`, `/api/admin/knowledge/**`,
`/admin/knowledge`.
**Question it answers:** *"I have studies, articles and training plans as PDFs. How do they get
taken into account when a plan is generated — with new documents arriving all the time?"*

---

## The decision: no document ever reaches plan generation

Two constraints from this repo decide the architecture, and they point the same way:

1. **The engine is deterministic.** `src/lib/engine/**` is pure TypeScript with no LLM in the plan
   core — that is what makes `engine_version` per plan meaningful, what the 10 synthetic athlete
   trajectories in `adaptive.test.ts` assert against, and what lets every adaptation be explained in
   one sentence. Retrieval-augmented generation at plan time would make two identical athletes get
   different plans depending on which chunk was retrieved.
2. **§7 of the implementation plan.** Training *principles* are not protectable; a concrete
   published *programme* is. The rule set there is explicit: use sources as research, formulate every
   block independently, `workout_blocks` is own IP, never scrape-and-reformat.

So a PDF is not context. A PDF is a **source of reviewed, structured changes** to the two things the
engine actually reads.

```
                                   ┌────────────────────────┐
  PDF ──▶ extract (Claude) ──▶ proposals ──▶ operator review ──▶ workout_blocks  ─┐
          quote + page                                       └▶ engine_config    ─┤
                                                                                  ▼
                                                                       deterministic engine
                                                                       (unchanged, no LLM)
```

## Three ways in, one review queue

The PDF is only one entry point. What actually matters is that every change to the engine passes the
same review gate — so information that has *already been read and analysed* elsewhere (another AI, a
coach's notes, your own digest) does not need to be turned back into a document first.

| Source (`knowledge_documents.source_type`) | What you hand over | What happens | Model runs? |
|---|---|---|---|
| `pdf` | the file | the model reads it and cites the page per proposal | yes |
| `note` | free text — an AI summary, notes, a digest of several studies | the same extractor structures it into proposals; no pages, so evidence is `page 0` plus the sentence it relies on | yes |
| `proposals` | finished proposals in the app's JSON contract | validated against the same schema and filed as-is | **no** |

The `proposals` path is the one for "my AI already did the analysis": nothing is generated, nothing
is re-interpreted, and no tokens are spent. Whatever fails validation comes back with the reason
(`blocks[0] difficulty_tier: expected number`) instead of being dropped silently — and if *everything*
fails, the source is refused rather than filed as an empty document.

**The contract.** `/admin/knowledge` → *Ready-made proposals* → **Copy the brief for your AI**
(`GET /api/admin/knowledge/brief`) gives you a self-contained prompt: the three proposal kinds, every
allowed enum, every tuning key with its range, the copyright rule, the evidence fields, and a worked
example. Paste it into whichever AI you use, together with the source; paste its answer back into the
box. The brief is generated from the same constants the validator enforces, and a test parses the
brief's own example through the validator — the contract cannot drift from what the app accepts.

**A note on second-hand claims.** For a `note`, the extractor is told the text is somebody else's
summary: when it names a study, a number or a mechanism, that is what gets cited; when it only
asserts something, confidence drops. You review either way — but the confidence figure means what it
says.

**The licence gate holds on all three paths.** `research_only` yields no library blocks, whether the
source is a PDF, a note, or ready-made JSON.

## The three anchor points

| Proposal kind | Lands in | Read by | Effect |
|---|---|---|---|
| `block` | `workout_blocks` row | `fill.ts` → `pickBlock()` | The generator can pick it from the next plan on — no deploy. |
| `tuning` | one key in `engine_config.config` | `loadTuning()` merges it over `DEFAULT_TUNING` | Calibration changes for every plan within ~5 min (per-instance cache). |
| `principle` | stays a proposal, marked accepted | nobody, automatically | Research note for the operator. A third-party programme can never become more than this. |

Nothing else is writable from a document. `refineTuning()` accepts only the 14 keys of
`EngineTuning`, each inside an explicit sanity range (`TUNING_BOUNDS`), so a mis-read study cannot
push `acwr_hard` to 12 or invert the one-step rule.

## The copyright gate is a data constraint, not a promise

Every document carries a rights class:

- `research_only` (default) — **cannot produce blocks.** Enforced twice: the extractor is told so in
  its system prompt, and `extractFromPdf()` drops any blocks it returns anyway.
- `licensed` / `own` — blocks allowed, and the copyright rule still applies in full: the extractor
  formulates blocks independently and is instructed to propose a principle instead whenever a block
  could not be written without following the source's programme.

Third-party training PDFs belong in `research_only`. That is the safe default in the upload form.

## Evidence, because review has to be fast

Each proposal carries `quote` (verbatim snippet), `page` (1-indexed) and `confidence`. The review UI
shows them next to a signed link to the source PDF, so checking a proposal is one lookup rather than
a re-read. The API's `citations` feature would provide those page anchors itself, but it is
incompatible with `output_config.format` (returns 400) — with structured output the evidence rides
in the schema instead, and the reviewer verifies it against the PDF.

## Operating it

**One source, in the browser:** `/admin/knowledge` → enter `CRON_SECRET` → pick the tab (PDF, AI
summary, or ready-made proposals), pick the rights class, optionally add a note ("focus on the taper
section") → review the queue: *Apply* writes the change, *Reject* parks it with your note.

**A folder of documents, from the shell:**

```bash
APP_URL=https://your-app.vercel.app CRON_SECRET=... \
  scripts/ingest_pdf.sh research_only ~/studies/*.pdf
```

**Re-submitting the same source** is refused by SHA-256 — of the file for a PDF, of the text for a
note, of the JSON for ready-made proposals — so a directory or a paste can be re-run safely.

### After a calibration change

`engine_config` is keyed by `engine_version`. An applied `tuning` proposal edits the row for the
*current* version and stores the previous value in `applied_before`, so it is revertible from the
audit row. If a change is big enough that old plans should stay reproducible under the old numbers,
bump `ENGINE_VERSION` in `src/lib/engine/constants.ts` and seed a new `engine_config` row — that is
a deliberate operator decision, not something a document triggers.

## Limits worth knowing

- **Size:** 25 MB per PDF (the API's request ceiling is 32 MB). Page limit is 600 on 1M-context
  models. A scanned PDF without a text layer extracts poorly — OCR it first. A note is capped at
  120,000 characters; ready-made proposals have no practical limit.
- **Cost:** one extraction reads the whole document. A 40-page study is a five-figure token count;
  budget accordingly if you bulk-load a library. A note costs proportionally less, and ready-made
  proposals cost nothing at all.
- **Runtime:** extraction happens inside the upload request (`maxDuration = 300`). Serverless plans
  cap this — on a constrained plan, upload the big documents from the shell script where a timeout
  only costs a retry.
- **Access:** `knowledge_documents` / `knowledge_proposals` have RLS enabled with **no policies** —
  invisible to every app user, reachable only through the service role behind `CRON_SECRET`. The
  storage bucket is private; the UI uses short-lived signed URLs.

## What this deliberately does not do

- No document text at generation time, and no LLM in the plan core.
- No auto-apply. Every change an athlete could feel passes a human first.
- No blocks from documents you have no rights to.
