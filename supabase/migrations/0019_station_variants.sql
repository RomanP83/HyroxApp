-- ============================================================================
-- Variants of the Hyrox station session, phase by phase.
--
-- Base builds absolute force and capacity, the build block chases strength
-- endurance and lactate tolerance, the specificity block rehearses race pace
-- and transitions, and the taper primes without emptying anything.
-- src/lib/engine/stationVariants.ts decides which one a week gets.
--
-- Loads are written against the competition weights the library already uses
-- (sled push 125/175 kg, sled pull 78/128 kg, farmers 2×24/2×32 kg,
-- sandbag 20/30 kg, wall balls 6/9 kg — open/pro).
-- ============================================================================

insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values

-- ── 1. Base: overload, maximal strength, base capacity ──────────────────────
('sv_overload_sled_grip', 'main', 'sled_push',
 '[{"exercise":"Sled push at 125% of race weight","distance_m":25,"load_by_division":{"open":"155 kg total","pro":"220 kg total"},"sets":5,"rest_sec":0},{"exercise":"Heavy farmers carry (+20% of race weight), straight off the sled","distance_m":100,"load_by_division":{"open":"2x28 kg","pro":"2x38 kg"},"sets":5,"rest_sec":150}]'::jsonb,
 'gym', 3, '{station_work,strength}', '{sled,grip,overload,base}'),
('sv_aerobic_erg_capacity', 'main', 'ski_erg',
 '[{"exercise":"SkiErg at Z2 / low Z3 (about 2:05-2:10 per 500 m)","sets":5,"rest_sec":0},{"exercise":"RowErg at the same effort, straight over — no pause between the ergs","sets":5,"rest_sec":0}]'::jsonb,
 'gym', 1, '{station_work}', '{ski,row,erg,aerobic,base}'),
('sv_wallball_lunge_volume', 'main', 'wall_balls',
 '[{"exercise":"Wall balls, unbroken","reps":25,"load_by_division":{"open":"6-7 kg / 3.0 m target","pro":"9-10 kg / 3.0 m target"},"sets":5,"rest_sec":0},{"exercise":"Walking lunges, kettlebells in the front rack","reps":20,"load_by_division":{"open":"2x16 kg","pro":"2x24 kg"},"sets":5,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work,strength}', '{wallball,lunges,volume,base}'),

-- ── 2. Build: strength endurance, cadence, lactate tolerance ────────────────
('sv_erg_threshold', 'main', 'row',
 '[{"exercise":"1000 m SkiErg or RowErg at race pace minus 3-5 s per 500 m (about 1:48-1:52), stroke rate 26-30","distance_m":1000,"sets":5,"rest_sec":90}]'::jsonb,
 'gym', 3, '{station_work}', '{erg,threshold,build}'),
('sv_density_emom', 'main', 'general',
 '[{"exercise":"Minute 1: wall balls, unbroken","reps":15,"load_by_division":{"open":"6 kg / 3.0 m","pro":"9 kg / 3.0 m"},"sets":6},{"exercise":"Minute 2: burpee broad jumps, smooth rhythm","reps":12,"sets":6},{"exercise":"Minute 3: farmers carry at race weight","distance_m":50,"load_by_division":{"open":"2x24 kg","pro":"2x32 kg"},"sets":6},{"exercise":"Minute 4: SkiErg at sub-max pace","distance_m":250,"sets":6},{"exercise":"Minute 5: rest","sets":6}]'::jsonb,
 'gym', 2, '{station_work}', '{emom,density,build}'),
('sv_push_pull_circuit', 'main', 'sled_pull',
 '[{"exercise":"Sled push at race weight","distance_m":50,"load_by_division":{"open":"125 kg total","pro":"175 kg total"},"sets":4,"rest_sec":0},{"exercise":"Sled pull at race weight, straight over","distance_m":50,"load_by_division":{"open":"78 kg total","pro":"128 kg total"},"sets":4,"rest_sec":0},{"exercise":"Dumbbell thrusters","reps":20,"load_by_division":{"open":"2x15 kg","pro":"2x22.5 kg"},"sets":4,"rest_sec":180}]'::jsonb,
 'gym', 3, '{station_work,strength}', '{sled,legs,lactate,build}'),

-- ── 3. Specificity: race pace, transitions, rhythm ──────────────────────────
('sv_engine_gauntlet', 'main', 'general',
 '[{"exercise":"SkiErg","distance_m":1000},{"exercise":"Sled push at race weight","distance_m":50,"load_by_division":{"open":"125 kg total","pro":"175 kg total"}},{"exercise":"Sled pull at race weight","distance_m":50,"load_by_division":{"open":"78 kg total","pro":"128 kg total"}},{"exercise":"Burpee broad jumps","distance_m":80},{"exercise":"RowErg","distance_m":1000},{"exercise":"Farmers carry at race weight","distance_m":200,"load_by_division":{"open":"2x24 kg","pro":"2x32 kg"}},{"exercise":"Sandbag lunges at race weight","distance_m":100,"load_by_division":{"open":"20 kg","pro":"30 kg"}},{"exercise":"Wall balls","reps":100,"load_by_division":{"open":"6 kg / 3.0 m","pro":"9 kg / 3.0 m"}}]'::jsonb,
 'gym', 3, '{station_work}', '{chipper,race_pace,specificity}'),
('sv_station_intervals_3x3', 'main', 'general',
 '[{"exercise":"RowErg at race pace","distance_m":500,"sets":3},{"exercise":"Sled push","distance_m":25,"load_by_division":{"open":"125 kg total","pro":"175 kg total"},"sets":3},{"exercise":"Burpee broad jumps","reps":30,"sets":3},{"exercise":"Sandbag lunges","distance_m":50,"load_by_division":{"open":"20 kg","pro":"30 kg"},"sets":3},{"exercise":"Wall balls","reps":30,"load_by_division":{"open":"6 kg / 3.0 m","pro":"9 kg / 3.0 m"},"sets":3,"rest_sec":180}]'::jsonb,
 'gym', 3, '{station_work}', '{simulation,transitions,specificity}'),
('sv_race_finish_finisher', 'main', 'wall_balls',
 '[{"exercise":"Sandbag walking lunges at race weight","distance_m":25,"load_by_division":{"open":"20 kg","pro":"30 kg"},"sets":4,"rest_sec":0},{"exercise":"Wall balls, unbroken","reps":25,"load_by_division":{"open":"6 kg / 3.0 m","pro":"9 kg / 3.0 m"},"sets":4,"rest_sec":60}]'::jsonb,
 'gym', 3, '{station_work}', '{wallball,lunges,finisher,specificity}'),

-- ── 4. Taper & race week: reactivity, freshness, precision ──────────────────
('sv_neural_priming', 'main', 'general',
 '[{"exercise":"SkiErg at exact race pace","distance_m":250,"sets":3},{"exercise":"Sled push at race weight — fast and explosive, not heavy","distance_m":12.5,"load_by_division":{"open":"125 kg total","pro":"175 kg total"},"sets":3},{"exercise":"Burpee broad jumps for maximum distance, soft landings","reps":5,"sets":3},{"exercise":"Wall balls at race weight","reps":10,"load_by_division":{"open":"6 kg / 3.0 m","pro":"9 kg / 3.0 m"},"sets":3,"rest_sec":120}]'::jsonb,
 'gym', 1, '{station_work}', '{priming,taper,race_week}'),
('sv_movement_primer', 'main', 'row',
 '[{"exercise":"Easy Zone-1 warm-up","rest_sec":0},{"exercise":"250 m RowErg or SkiErg with 30 s at race pace inside each","distance_m":250,"sets":4,"rest_sec":90},{"exercise":"Mobility for shoulder girdle and hip flexors","rest_sec":0}]'::jsonb,
 'gym', 1, '{station_work}', '{priming,mobility,taper,race_week}')

on conflict (slug) do nothing;
