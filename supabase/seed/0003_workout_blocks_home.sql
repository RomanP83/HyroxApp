-- ============================================================================
-- Home / minimal-equipment library (Phase C5, §2 Should-Have).
-- Originally authored alternatives per station so home_minimal athletes get
-- purpose-built blocks instead of the gym fallback. Loads assume dumbbells or
-- a loaded backpack — always explicit (PP2).
-- ============================================================================

insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('st_home_ski', 'main', 'ski_erg',
 '[{"exercise":"Band lat pull-downs (anchored high)","reps":20,"sets":5,"rest_sec":45},{"exercise":"Burpees","reps":10,"sets":5,"rest_sec":45}]'::jsonb,
 'home', 1, '{station_work}', '{home,ski,upper}'),
('st_home_row', 'main', 'row',
 '[{"exercise":"Bent-over rows","reps":15,"load_by_division":{"open":"2x12 kg","pro":"2x20 kg"},"sets":5,"rest_sec":60},{"exercise":"Jump squats","reps":12,"sets":5,"rest_sec":45}]'::jsonb,
 'home', 1, '{station_work}', '{home,row,pull}'),
('st_home_sled_push', 'main', 'sled_push',
 '[{"exercise":"Bear crawl","distance_m":15,"sets":6,"rest_sec":60},{"exercise":"Loaded step-ups (backpack)","reps":12,"load_by_division":{"open":"15 kg","pro":"25 kg"},"sets":4,"rest_sec":75}]'::jsonb,
 'home', 1, '{station_work,strength}', '{home,sled,legs}'),
('st_home_sled_pull', 'main', 'sled_pull',
 '[{"exercise":"Towel rows (partner/anchor) or heavy band pulls","reps":15,"sets":5,"rest_sec":60},{"exercise":"Reverse lunges","reps":16,"load_by_division":{"open":"2x10 kg","pro":"2x16 kg"},"sets":4,"rest_sec":60}]'::jsonb,
 'home', 1, '{station_work,strength}', '{home,sled,pull}'),
('st_home_wallballs', 'main', 'wall_balls',
 '[{"exercise":"Dumbbell thrusters","reps":20,"load_by_division":{"open":"2x7,5 kg","pro":"2x10 kg"},"sets":4,"rest_sec":75}]'::jsonb,
 'home', 1, '{station_work}', '{home,wallball,legs}'),
('st_home_farmers', 'main', 'farmers_carry',
 '[{"exercise":"Farmers carry (dumbbells or canisters)","distance_m":80,"load_by_division":{"open":"2x16 kg","pro":"2x24 kg"},"sets":4,"rest_sec":90},{"exercise":"Dead hang or towel hang","reps":40,"sets":3,"rest_sec":60}]'::jsonb,
 'home', 1, '{station_work,strength}', '{home,grip,carry}'),
('st_home_lunges', 'main', 'sandbag_lunges',
 '[{"exercise":"Walking lunges (loaded backpack)","distance_m":40,"load_by_division":{"open":"15 kg","pro":"25 kg"},"sets":4,"rest_sec":90}]'::jsonb,
 'home', 1, '{station_work,strength}', '{home,legs,lunges}'),
('cr_home_run_lunge', 'main', 'general',
 '[{"exercise":"1000 m run at race pace","distance_m":1000,"sets":3,"rest_sec":0},{"exercise":"Backpack walking lunges 25 m after each run","distance_m":25,"load_by_division":{"open":"15 kg","pro":"25 kg"},"sets":3,"rest_sec":120}]'::jsonb,
 'home', 1, '{compromised_run}', '{home,compromised}'),
('cr_home_run_thruster', 'main', 'general',
 '[{"exercise":"800 m run at race pace","distance_m":800,"sets":4,"rest_sec":0},{"exercise":"Dumbbell thrusters after each run","reps":15,"load_by_division":{"open":"2x7,5 kg","pro":"2x10 kg"},"sets":4,"rest_sec":120}]'::jsonb,
 'home', 2, '{compromised_run}', '{home,compromised}'),
('sim_home_hyrox', 'main', 'general',
 '[{"exercise":"4 rounds: 1000 m run + home station circuit (thrusters, lunges, rows, burpees)","distance_m":1000,"sets":4,"rest_sec":0,"load_by_division":{"open":"dumbbells 2x7,5 kg / backpack 15 kg","pro":"2x10 kg / 25 kg"}}]'::jsonb,
 'home', 2, '{full_sim}', '{home,simulation}')
on conflict (slug) do nothing;
