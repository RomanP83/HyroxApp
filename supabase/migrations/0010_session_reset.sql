-- ============================================================================
-- Undo a logged day (PP3/PP5 — a mis-tap must not silently reshape the plan)
--
-- Logging a session ("As planned" / "Harder" / "Easier") runs Layer-1
-- micro-calibration, which mutates athlete_state (tiers, pace zones, strength
-- modifier, loads). To take a single day back we need two things:
--
--   session_logs.state_before   snapshot of the engine-owned state fields as
--                               they were BEFORE this log was calibrated in.
--                               Reset restores it, then replays every later
--                               log so the chain stays deterministic.
--   plan_adjustments.session_id which log produced an audit row, so the reset
--                               can drop exactly the rows it rolls back
--                               (manual moves / macro rows keep session_id null).
-- ============================================================================

alter table session_logs
  add column if not exists state_before jsonb;

alter table plan_adjustments
  add column if not exists session_id uuid references sessions(id) on delete cascade;

create index if not exists plan_adjustments_session_idx
  on plan_adjustments(session_id);

-- Audit trigger for the manual reset itself ("Why your plan changed" — PP1).
alter type adjustment_trigger_t add value if not exists 'manual_reset';
