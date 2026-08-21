-- ============================================================================
-- workout_blocks library (Implementation Plan §3 — own IP, §7 copyright note)
-- Every block is originally authored. Loads are ALWAYS explicit per division
-- (open/pro) — the literal App-Store cancellation reason (PP2).
-- difficulty_tier 1..3 is what the engine scales via athlete_state.station_tiers.
-- ============================================================================

-- ── WARM-UPS (general) ──────────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('wu_general_raise', 'warmup', 'general',
 '[{"exercise":"Row or bike easy","distance_m":500,"rest_sec":0},{"exercise":"Leg swings + world''s greatest stretch","reps":8,"rest_sec":0},{"exercise":"Air squats","reps":15,"rest_sec":0}]'::jsonb,
 'gym', 1, '{strength,station_work,run_intervals,compromised_run,full_sim,benchmark}', '{warmup,activation}'),
('wu_run_drills', 'warmup', 'run',
 '[{"exercise":"Easy jog","distance_m":800,"rest_sec":0},{"exercise":"A-skips / high knees","distance_m":20,"sets":3,"rest_sec":30},{"exercise":"Strides","distance_m":60,"sets":4,"rest_sec":60}]'::jsonb,
 'gym', 1, '{run_easy,run_intervals,compromised_run}', '{warmup,running}'),
('wu_home_mobility', 'warmup', 'general',
 '[{"exercise":"Jumping jacks","reps":40,"rest_sec":0},{"exercise":"Inchworm to push-up","reps":8,"rest_sec":0},{"exercise":"Reverse lunge + reach","reps":10,"rest_sec":0}]'::jsonb,
 'home', 1, '{strength,station_work}', '{warmup,home}')
on conflict (slug) do nothing;

-- ── RUN (easy / intervals) ──────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('run_easy_z2', 'main', 'run',
 '[{"exercise":"Zone-2 continuous run at easy pace zone","distance_m":6000,"rest_sec":0}]'::jsonb,
 'gym', 1, '{run_easy}', '{aerobic,running}'),
('run_intervals_400', 'main', 'run',
 '[{"exercise":"400 m at interval pace","sets":6,"distance_m":400,"rest_sec":90}]'::jsonb,
 'gym', 1, '{run_intervals}', '{vo2,running}'),
('run_intervals_800', 'main', 'run',
 '[{"exercise":"800 m at interval pace","sets":5,"distance_m":800,"rest_sec":120}]'::jsonb,
 'gym', 2, '{run_intervals}', '{threshold,running}'),
('run_intervals_1k', 'main', 'run',
 '[{"exercise":"1000 m at tempo pace","sets":5,"distance_m":1000,"rest_sec":150}]'::jsonb,
 'gym', 3, '{run_intervals}', '{threshold,running}')
on conflict (slug) do nothing;

-- ── COMPROMISED RUNNING (run + station under fatigue) ───────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('cr_run_wallball', 'main', 'general',
 '[{"exercise":"1000 m run at race pace","distance_m":1000,"sets":4,"rest_sec":0},{"exercise":"Wall balls immediately after each run","reps":25,"load_by_division":{"open":"6 kg","pro":"9 kg"},"sets":4,"rest_sec":120}]'::jsonb,
 'gym', 1, '{compromised_run}', '{compromised,hyrox}'),
('cr_run_sled', 'main', 'general',
 '[{"exercise":"800 m run at race pace","distance_m":800,"sets":4,"rest_sec":0},{"exercise":"Sled push 15 m after each run","distance_m":15,"load_by_division":{"open":"125 kg total","pro":"175 kg total"},"sets":4,"rest_sec":150}]'::jsonb,
 'gym', 2, '{compromised_run}', '{compromised,hyrox,legs}'),
('cr_run_lunge', 'main', 'general',
 '[{"exercise":"1000 m run at race pace","distance_m":1000,"sets":3,"rest_sec":0},{"exercise":"Sandbag walking lunges 25 m","distance_m":25,"load_by_division":{"open":"20 kg","pro":"30 kg"},"sets":3,"rest_sec":120}]'::jsonb,
 'gym', 3, '{compromised_run}', '{compromised,hyrox,legs}')
on conflict (slug) do nothing;

-- ── STATION WORK (per-station, tiered) ──────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('st_ski_intervals', 'main', 'ski_erg',
 '[{"exercise":"SkiErg intervals","distance_m":250,"sets":6,"rest_sec":60}]'::jsonb,
 'gym', 1, '{station_work}', '{ski,upper}'),
('st_ski_race', 'main', 'ski_erg',
 '[{"exercise":"SkiErg race-pace holds","distance_m":500,"sets":4,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work}', '{ski,upper}'),
('st_row_intervals', 'main', 'row',
 '[{"exercise":"Row intervals","distance_m":250,"sets":6,"rest_sec":60}]'::jsonb,
 'gym', 1, '{station_work}', '{row,pull}'),
('st_row_race', 'main', 'row',
 '[{"exercise":"Row race-pace holds","distance_m":500,"sets":4,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work}', '{row,pull}'),
('st_sled_push', 'main', 'sled_push',
 '[{"exercise":"Sled push","distance_m":12.5,"load_by_division":{"open":"125 kg total","pro":"175 kg total"},"sets":6,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work,strength}', '{sled,legs}'),
('st_sled_pull', 'main', 'sled_pull',
 '[{"exercise":"Sled pull (rope, hand-over-hand)","distance_m":12.5,"load_by_division":{"open":"78 kg total","pro":"128 kg total"},"sets":6,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work,strength}', '{sled,pull}'),
('st_burpee_bj', 'main', 'burpee_broad_jump',
 '[{"exercise":"Burpee broad jumps","distance_m":20,"sets":4,"rest_sec":75}]'::jsonb,
 'gym', 1, '{station_work}', '{burpee,engine}'),
('st_farmers', 'main', 'farmers_carry',
 '[{"exercise":"Farmers carry","distance_m":100,"load_by_division":{"open":"2x24 kg","pro":"2x32 kg"},"sets":4,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work,strength}', '{grip,carry}'),
('st_lunges', 'main', 'sandbag_lunges',
 '[{"exercise":"Sandbag walking lunges","distance_m":50,"load_by_division":{"open":"20 kg","pro":"30 kg"},"sets":4,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work,strength}', '{legs,lunges}'),
('st_wallballs', 'main', 'wall_balls',
 '[{"exercise":"Wall balls (unbroken sets)","reps":25,"load_by_division":{"open":"6 kg / 3.0 m target","pro":"9 kg / 3.0 m target"},"sets":4,"rest_sec":75}]'::jsonb,
 'gym', 1, '{station_work}', '{wallball,legs}')
on conflict (slug) do nothing;

-- ── STRENGTH ────────────────────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('str_lower_squat', 'main', 'general',
 '[{"exercise":"Back squat","sets":4,"reps":6,"load_by_division":{"open":"70% 1RM","pro":"78% 1RM"},"rest_sec":150},{"exercise":"Romanian deadlift","sets":3,"reps":8,"load_by_division":{"open":"moderate","pro":"heavy"},"rest_sec":120}]'::jsonb,
 'gym', 2, '{strength}', '{lower,strength}'),
('str_push_pull', 'main', 'general',
 '[{"exercise":"Push press","sets":4,"reps":6,"load_by_division":{"open":"moderate","pro":"heavy"},"rest_sec":120},{"exercise":"Pull-ups","sets":4,"reps":8,"rest_sec":90}]'::jsonb,
 'gym', 2, '{strength}', '{upper,strength}'),
('str_posterior', 'main', 'general',
 '[{"exercise":"Deadlift","sets":5,"reps":5,"load_by_division":{"open":"75% 1RM","pro":"82% 1RM"},"rest_sec":180},{"exercise":"Weighted step-ups","sets":3,"reps":10,"load_by_division":{"open":"2x16 kg","pro":"2x24 kg"},"rest_sec":90}]'::jsonb,
 'gym', 3, '{strength}', '{lower,strength}'),
('str_home_unilateral', 'main', 'general',
 '[{"exercise":"Bulgarian split squat","sets":4,"reps":12,"load_by_division":{"open":"2x12 kg","pro":"2x20 kg"},"rest_sec":90},{"exercise":"Backpack RDL","sets":3,"reps":12,"rest_sec":60},{"exercise":"Push-ups","sets":3,"reps":20,"rest_sec":60}]'::jsonb,
 'home', 1, '{strength}', '{home,lower}')
on conflict (slug) do nothing;

-- ── FULL SIMULATION (Peak) ──────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('sim_half_hyrox', 'main', 'general',
 '[{"exercise":"4 rounds: 1000 m run + one station","distance_m":1000,"sets":4,"rest_sec":0,"load_by_division":{"open":"station @ open weights","pro":"station @ pro weights"}}]'::jsonb,
 'gym', 2, '{full_sim}', '{simulation,hyrox}'),
('sim_full_hyrox', 'main', 'general',
 '[{"exercise":"Full Hyrox simulation: 8x(1000 m run + station in order)","distance_m":8000,"sets":1,"rest_sec":0,"load_by_division":{"open":"all stations @ open weights","pro":"all stations @ pro weights"}}]'::jsonb,
 'gym', 3, '{full_sim,benchmark}', '{simulation,hyrox,race}')
on conflict (slug) do nothing;

-- ── FINISHERS ───────────────────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('fin_core', 'finisher', 'general',
 '[{"exercise":"Plank","reps":45,"sets":3,"rest_sec":30},{"exercise":"Hollow hold","reps":30,"sets":3,"rest_sec":30}]'::jsonb,
 'gym', 1, '{strength,station_work}', '{core,finisher}'),
('fin_grip', 'finisher', 'farmers_carry',
 '[{"exercise":"Dead hang","reps":40,"sets":3,"rest_sec":45},{"exercise":"Farmers hold","reps":40,"load_by_division":{"open":"2x24 kg","pro":"2x32 kg"},"sets":3,"rest_sec":60}]'::jsonb,
 'gym', 1, '{strength,station_work}', '{grip,finisher}')
on conflict (slug) do nothing;

-- ── MOBILITY / RECOVERY ─────────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('mob_lower', 'mobility', 'general',
 '[{"exercise":"Couch stretch","reps":60,"sets":2,"rest_sec":0},{"exercise":"90/90 hip switches","reps":10,"sets":2,"rest_sec":0},{"exercise":"Ankle rocks","reps":12,"sets":2,"rest_sec":0}]'::jsonb,
 'gym', 1, '{mobility,strength,station_work,compromised_run,run_intervals,full_sim}', '{mobility,recovery}'),
('mob_full', 'mobility', 'general',
 '[{"exercise":"Thoracic openers","reps":10,"sets":2,"rest_sec":0},{"exercise":"Pigeon stretch","reps":45,"sets":2,"rest_sec":0},{"exercise":"Downward dog to cobra flow","reps":8,"sets":2,"rest_sec":0}]'::jsonb,
 'gym', 1, '{mobility}', '{mobility,recovery}'),
('mob_lowimpact', 'main', 'general',
 '[{"exercise":"Easy bike or swim","planned_duration_min":30,"rest_sec":0},{"exercise":"Full-body mobility flow","reps":10,"sets":3,"rest_sec":0}]'::jsonb,
 'gym', 1, '{mobility,rest}', '{rehab,lowimpact}')
on conflict (slug) do nothing;
