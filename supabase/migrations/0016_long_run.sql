-- ============================================================================
-- The long run.
--
-- Running is 50-60% of a Hyrox and the Zone-2 long run is the session that
-- carries it — 60-90 minutes at conversational pace, for mitochondrial density
-- and tendon economy. The plan had no session type for it: "run_easy" covered
-- recovery running and nothing covered the long one.
--
-- Note for an EXISTING database: this adds the enum value. A fresh install
-- gets it from 0001 (the create-type there lists it), which is what keeps
-- setup.sql runnable as a single transaction — a new enum value may not be
-- USED in the transaction that adds it. Nothing here uses it: the library
-- block below is tagged, not typed (see src/lib/engine/fill.ts).
-- ============================================================================

alter type session_type_t add value if not exists 'long_run';

-- The long-run block. It stays a `run_easy` block by type and is picked for a
-- long run by its "long" tag, so this file never has to reference the new enum
-- value it just created.
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags)
values (
  'run_long_z2',
  'main',
  'run',
  '[{"exercise":"Continuous Zone-2 run — conversational the whole way, 60-90 s/km slower than 5k pace","rest_sec":0}]'::jsonb,
  'gym',
  1,
  '{run_easy}',
  '{aerobic,running,long}'
)
on conflict (slug) do nothing;
