-- ============================================================================
-- Engine v1.2 state fields (Roadmap A6 + A7, fixes M3 + M4)
-- strength_modifier: persisted +-5%-per-step multiplier the strength
--   calibration actually applies (previously only audited, never applied).
-- pace_zones_ref / pace_ref_at: weekly snapshot of the pace zones so the
--   +-3% cap holds per WEEK (plan §5), not per individual log.
-- ============================================================================

alter table athlete_state
  add column if not exists strength_modifier numeric not null default 1.0,
  add column if not exists pace_zones_ref jsonb not null default '{}'::jsonb,
  add column if not exists pace_ref_at timestamptz;
