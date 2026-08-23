-- ============================================================================
-- 0023 — five experience levels instead of three.
--
-- The coaching reference splits athletes by target time, and the training
-- frequency table needs the top of the field: an Elite athlete (sub-70)
-- trains 6-8 sessions over 5-6 days with occasional doubles, a World-Class
-- athlete (sub-60) 7-9 sessions over 6 days with AM/PM as the norm — neither
-- fits into "advanced".
--
-- Note for an EXISTING database: this adds the enum values. A fresh install
-- gets them from 0001 (the create-type there lists them), which is what keeps
-- setup.sql runnable as a single transaction — a new enum value may not be
-- USED in the transaction that adds it. Nothing here uses them: the frequency
-- table and station tiers live in application code.
-- ============================================================================

alter type experience_level_t add value if not exists 'elite';
alter type experience_level_t add value if not exists 'world_class';
