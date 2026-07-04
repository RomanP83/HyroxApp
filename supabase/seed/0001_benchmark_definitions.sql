-- ============================================================================
-- Benchmark protocol (Implementation Plan §2 Must-Have)
-- Start / Mid / Pre-Race testing — proves progress, feeds pace zones + prognosis.
-- ============================================================================
insert into benchmark_definitions (slug, name, metric_type, protocol) values
  ('run_1k',      '1 km Time Trial',      'time_sec',   'All-out 1 km run from standstill. Fuels running pace zones.'),
  ('row_1000',    '1000 m Row',           'time_sec',   'All-out 1000 m on a Concept2 rower, damper 5–6.'),
  ('ski_1000',    '1000 m SkiErg',        'time_sec',   'All-out 1000 m on the SkiErg.'),
  ('wall_balls',  'Max Wall Balls (2 min)','reps',      'Max wall balls in 2 minutes at division weight/target height.'),
  ('burpee_bj_4', 'Burpee Broad Jumps 40 m','time_sec', 'Time for 40 m of burpee broad jumps — hinge-station proxy.'),
  ('run_5k',      '5 km Time Trial',      'time_sec',   'Baseline aerobic test captured at onboarding; refreshes at mid.')
on conflict (slug) do nothing;
