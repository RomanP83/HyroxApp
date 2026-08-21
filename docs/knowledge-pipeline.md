# Knowledge pipeline — how PDFs reach the plan

**Status:** implemented — `supabase/migrations/0011_knowledge_pipeline.sql`, `src/lib/knowledge/**`,
`/api/admin/knowledge/**`, `/admin/knowledge`.
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

**One document, in the browser:** `/admin/knowledge` → enter `CRON_SECRET` → upload the PDF, pick
the rights class, optionally add a note ("focus on the taper section") → the extractor runs → review
the queue: *Apply* writes the change, *Reject* parks it with your note.

**A folder of documents, from the shell:**

```bash
APP_URL=https://your-app.vercel.app CRON_SECRET=... \
  scripts/ingest_pdf.sh research_only ~/studies/*.pdf
```

**Re-uploading the same PDF** is refused by SHA-256, so a directory can be re-run safely.

### After a calibration change

`engine_config` is keyed by `engine_version`. An applied `tuning` proposal edits the row for the
*current* version and stores the previous value in `applied_before`, so it is revertible from the
audit row. If a change is big enough that old plans should stay reproducible under the old numbers,
bump `ENGINE_VERSION` in `src/lib/engine/constants.ts` and seed a new `engine_config` row — that is
a deliberate operator decision, not something a document triggers.

## Limits worth knowing

- **Size:** 25 MB per PDF (the API's request ceiling is 32 MB). Page limit is 600 on 1M-context
  models. A scanned PDF without a text layer extracts poorly — OCR it first.
- **Cost:** one extraction reads the whole document. A 40-page study is a five-figure token count;
  budget accordingly if you bulk-load a library.
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
