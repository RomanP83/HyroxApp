-- ============================================================================
-- 0028 — an erg ladder into a hundred wall balls, and the AT-PT trial.
--
-- Erg ladder: the build block had erg threshold intervals and wall balls under
-- fatigue, but never the two together — a long erg piece, paced faster every
-- kilometre, straight into the race's full hundred wall balls. Selection lives
-- in src/lib/engine/stationVariants.ts.
--
-- AT-PT: five minutes on the erg held inside a heart-rate band near threshold.
-- Two numbers come out of it — the average watts, and how long the heart takes
-- to fall back afterwards. The band is worked out from the athlete's own max
-- heart rate, which therefore gets a column (src/lib/atpt.ts has the maths).
-- ============================================================================

alter table athlete_profiles
  add column if not exists hr_max int check (hr_max between 120 and 230);

insert into benchmark_definitions (slug, name, metric_type, protocol) values
  ('atpt_watts',    'AT-PT · watts at threshold HR', 'watts',
   'Average watts over 5 min on the erg, held inside the heart-rate band from your max HR (about 87 %). Same machine every time.'),
  ('atpt_recovery', 'AT-PT · recovery time',          'time_sec',
   'Time from the end of the 5-min hold until your heart rate is down to two thirds of your max.')
on conflict (slug) do nothing;

insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('sv_erg_ladder_wallballs', 'main', 'wall_balls',
 '[{"exercise":"SkiErg or RowErg, 5 × 1000 m straight through — first kilometre at race pace + 10 s / 500 m, then 3-5 s / 500 m faster every kilometre; the last one at or under race pace","distance_m":1000,"sets":5,"rest_sec":0},{"exercise":"Wall balls straight off the erg — planned sets (e.g. 25-25-20-15-15), never more than 10 s between them","reps":100,"load_by_division":{"open":"6 kg / 3.0 m","pro":"9 kg / 3.0 m"},"rest_sec":0}]'::jsonb,
 'gym', 3, '{station_work}', '{erg,pacing,wallball,build}')
on conflict (slug) do nothing;
