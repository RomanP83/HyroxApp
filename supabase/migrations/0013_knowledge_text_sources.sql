-- ============================================================================
-- Knowledge sources that are not PDFs.
--
-- Two ways to hand the app information that has ALREADY been read and analysed
-- somewhere else (another AI, a coach's notes, a summary):
--
--   'note'      free text. The extractor structures it into proposals, exactly
--               as it does for a PDF — only the input differs.
--   'proposals' finished proposals in the app's own JSON contract. Nothing is
--               generated: the payload is validated and filed for review, so
--               no model runs and no tokens are spent.
--
-- Both land in the same review queue as a PDF, and the same apply path writes
-- them into workout_blocks / engine_config. Review stays the single gate.
-- ============================================================================

do $$ begin
  create type knowledge_source_t as enum ('pdf', 'note', 'proposals');
exception when duplicate_object then null; end $$;

alter table knowledge_documents
  add column if not exists source_type knowledge_source_t not null default 'pdf',
  -- The pasted text / raw JSON, kept so a reviewer can read the source that
  -- produced a proposal without leaving the app.
  add column if not exists body text;

-- Only a PDF has a file behind it.
alter table knowledge_documents alter column storage_path drop not null;
