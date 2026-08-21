-- ============================================================================
-- Knowledge pipeline: PDFs (studies, articles, training literature) become
-- REVIEWED, structured input for the engine — never raw context at generation
-- time (§7 + "no LLM in the plan core").
--
-- Flow:  upload -> extract (Claude reads the PDF) -> proposals -> operator
--        review -> apply into workout_blocks / engine_config.
--
-- Three proposal kinds, mapped to the two places the engine actually reads:
--   block      -> workout_blocks   (library the fill layer picks from)
--   tuning     -> engine_config    (calibration constants, merged over defaults)
--   principle  -> nothing automatic. Research note for the operator; a
--                 third-party programme may never become a block (§7:
--                 principles are not protectable, concrete plans are).
--
-- Operator-only data: RLS is on and NO policy exists, so anon/authenticated
-- see nothing at all. Every access goes through the service role behind the
-- CRON_SECRET-guarded /api/admin routes.
-- ============================================================================

do $$ begin
  create type knowledge_license_t as enum ('own', 'licensed', 'research_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type knowledge_doc_status_t as enum ('uploaded', 'extracted', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type proposal_kind_t as enum ('block', 'tuning', 'principle');
exception when duplicate_object then null; end $$;

do $$ begin
  create type proposal_status_t as enum ('pending', 'approved', 'applied', 'rejected', 'failed');
exception when duplicate_object then null; end $$;

-- ── knowledge_documents ─────────────────────────────────────────────────────
create table if not exists knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  filename text not null,
  -- Path inside the private `knowledge` storage bucket.
  storage_path text not null,
  -- Dedupe: the same PDF uploaded twice is rejected, not re-extracted.
  sha256 text not null unique,
  bytes int not null default 0,
  -- 'research_only' documents can never produce block proposals (§7).
  license knowledge_license_t not null default 'research_only',
  status knowledge_doc_status_t not null default 'uploaded',
  summary text,
  error text,
  notes text,
  uploaded_at timestamptz not null default now(),
  extracted_at timestamptz
);

-- ── knowledge_proposals ─────────────────────────────────────────────────────
create table if not exists knowledge_proposals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  kind proposal_kind_t not null,
  status proposal_status_t not null default 'pending',
  -- One-line what-it-is, shown in the review list.
  summary text not null,
  -- Why the document supports it, in the extractor's words.
  rationale text,
  -- Verbatim evidence + where it sits in the PDF, so review is one lookup.
  quote text,
  page int,
  confidence numeric,
  -- The typed change itself (block row / tuning key+value / principle topic).
  payload jsonb not null default '{}'::jsonb,
  -- Audit of the apply step.
  applied_at timestamptz,
  applied_ref jsonb,      -- { table, id } / { engine_version, key }
  applied_before jsonb,   -- previous value, so a tuning change is revertible
  reviewer_note text,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_proposals_doc_idx on knowledge_proposals(document_id);
create index if not exists knowledge_proposals_status_idx on knowledge_proposals(status);

-- Operator-only: RLS on, no policies → service role is the sole reader/writer.
alter table knowledge_documents enable row level security;
alter table knowledge_proposals enable row level security;

-- ── Private storage bucket for the source PDFs ──────────────────────────────
-- Guarded so the file also runs on a database without the storage schema.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('knowledge', 'knowledge', false)
    on conflict (id) do nothing;
  end if;
end $$;
