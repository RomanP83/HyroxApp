-- ============================================================================
-- 0037 — which planned session a Garmin run was logged against.
--
-- Set by /api/garmin/import when a run is matched to a planned run session of
-- the current week. A run with a session is already in the load through its
-- log; a run without one enters the load as an unplanned run.
-- ============================================================================

alter table garmin_runs
  add column if not exists session_id uuid references sessions(id) on delete set null;

create index if not exists garmin_runs_session_idx on garmin_runs(session_id);
