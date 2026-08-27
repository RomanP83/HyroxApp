-- ============================================================================
-- 0031 — the last race's station splits, kept on the athlete's state.
--
-- The race result already recalibrated station_tiers, which is an ordinal 1..3
-- and loses most of what eight measured splits actually said. The finish-time
-- prognosis now runs on the same race model as the pacing sheet, and that model
-- wants seconds, so the seconds are kept here: engine-owned state, written by
-- the race-result route, read by every prediction.
--
-- Empty until a race is logged; the tiers carry the estimate on their own until
-- then.
-- ============================================================================

alter table athlete_state
  add column if not exists measured_station_seconds jsonb not null default '{}'::jsonb;
