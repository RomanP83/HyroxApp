-- ============================================================================
-- 0033 — what to do when the equipment is not free.
--
-- A plan that only works in an empty gym is a plan that gets skipped. The sled
-- is taken, the wall-ball corner has a class in it — and the session simply
-- does not happen, which costs more than any substitution would.
--
-- Stored per station rather than per session, and on the profile rather than
-- on a plan: "there is no sled in my gym" is a fact about the gym, not about
-- Tuesday, and a preference that lives here survives every rebuild by not
-- being part of the plan at all. The engine never reads it — substitutions are
-- applied when a session is rendered, so the plan stays deterministic.
--
-- { "sled_push": "push_incline_march", ... } — station to alternative slug,
-- both defined in src/lib/engine/stationAlternatives.ts.
-- ============================================================================

alter table athlete_profiles
  add column if not exists station_substitutions jsonb not null default '{}'::jsonb;
