-- ============================================================================
-- Running volume the athlete sets, instead of one the engine assumes.
--
--   weekly_km_peak   the highest weekly running volume of the cycle. Every
--                    other week is derived from it by the phase curve, so one
--                    number describes the whole build (a cycle average would
--                    hide exactly the week that decides whether it is doable).
--   runs_per_week    how many of the week's sessions are runs.
--
-- Both nullable: unset means the engine keeps deriving volume from the session
-- prescriptions in src/lib/engine/running.ts, which is what every existing
-- plan does today.
-- ============================================================================

alter table athlete_profiles
  add column if not exists weekly_km_peak numeric
    check (weekly_km_peak is null or weekly_km_peak between 15 and 150),
  add column if not exists runs_per_week int
    check (runs_per_week is null or runs_per_week between 2 and 6);
