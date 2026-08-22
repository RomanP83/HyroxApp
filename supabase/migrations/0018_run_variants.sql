-- ============================================================================
-- Variants of the four core run sessions.
--
-- One shape per core session made a twelve-week plan repeat itself. These are
-- the alternatives the engine rotates through (src/lib/engine/runVariants.ts
-- decides which one a given week gets, and why).
--
-- Long-run variants are typed `run_easy` and carry the `long` tag: the same
-- convention migration 0016 established, so this file never has to reference
-- the `long_run` enum value and setup.sql stays runnable in one transaction.
-- ============================================================================

insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values

-- ── 1. Zone 2 long run ──────────────────────────────────────────────────────
('lr_flat_steady', 'main', 'run',
 '[{"exercise":"Continuous Zone-2 run on flat terrain — conversational, heart rate strictly in Z2","rest_sec":0}]'::jsonb,
 'gym', 1, '{run_easy}', '{aerobic,running,long,flat}'),
('lr_rolling_hills', 'main', 'run',
 '[{"exercise":"Rolling-hills run: drop the pace (or walk) on every climb to hold Zone 2","rest_sec":0},{"exercise":"Let the descents stay relaxed — no braking, no surging"}]'::jsonb,
 'gym', 2, '{run_easy}', '{aerobic,running,long,hills}'),
('lr_progression', 'main', 'run',
 '[{"exercise":"Strict Zone 2 for the first two thirds","rest_sec":0},{"exercise":"Final third: lift progressively to the top of Zone 3 (sub-threshold)","rest_sec":0}]'::jsonb,
 'gym', 3, '{run_easy}', '{aerobic,running,long,progression}'),

-- ── 2. Easy / recovery run ──────────────────────────────────────────────────
('er_shakeout_strides', 'main', 'run',
 '[{"exercise":"Very easy jog, Zone 1 to low Zone 2","rest_sec":0},{"exercise":"Strides, relaxed and fast — not a sprint","distance_m":80,"sets":5,"rest_sec":60}]'::jsonb,
 'gym', 1, '{run_easy}', '{recovery,running,strides}'),
('er_soft_surface', 'main', 'run',
 '[{"exercise":"Recovery run on grass or forest floor at RPE 1-3 — soft surface, short stride, no watch-watching","rest_sec":0}]'::jsonb,
 'gym', 1, '{run_easy}', '{recovery,running,soft_surface}'),
('er_cross_combo', 'main', 'run',
 '[{"exercise":"Easy running, Zone 1","rest_sec":0},{"exercise":"SkiErg, RowErg or bike in Zone 1 — same aerobic time, half the impact","rest_sec":0}]'::jsonb,
 'gym', 1, '{run_easy}', '{recovery,running,cross_training,erg}'),

-- ── 3. Threshold & VO₂max intervals ─────────────────────────────────────────
('iv_vo2_1k', 'main', 'run',
 '[{"exercise":"1000 m at 3k-5k race pace","distance_m":1000,"sets":6,"rest_sec":135}]'::jsonb,
 'gym', 2, '{run_intervals}', '{vo2,running,intervals}'),
('iv_cruise_2k', 'main', 'run',
 '[{"exercise":"2000 m at 10k / half-marathon pace","distance_m":2000,"sets":4,"rest_sec":75}]'::jsonb,
 'gym', 2, '{run_intervals}', '{threshold,running,intervals}'),
('iv_pyramid', 'main', 'run',
 '[{"exercise":"400 m at 3k pace","distance_m":400,"rest_sec":75},{"exercise":"800 m at 5k pace","distance_m":800,"rest_sec":150},{"exercise":"1200 m at 5k-10k pace","distance_m":1200,"rest_sec":225},{"exercise":"1600 m at 10k pace","distance_m":1600,"rest_sec":300},{"exercise":"1200 m at 5k-10k pace","distance_m":1200,"rest_sec":225},{"exercise":"800 m at 5k pace","distance_m":800,"rest_sec":150},{"exercise":"400 m at 3k pace","distance_m":400,"rest_sec":75}]'::jsonb,
 'gym', 3, '{run_intervals}', '{vo2,threshold,running,intervals,pyramid}'),
('iv_30_30', 'main', 'run',
 '[{"exercise":"10-minute block: 30 s hard (Zone 5) / 30 s jog (Zone 1-2)","sets":3,"rest_sec":180}]'::jsonb,
 'gym', 2, '{run_intervals}', '{vo2,anaerobic,running,intervals,short_reps}'),

-- ── 4. Compromised running / bricks ─────────────────────────────────────────
('cr_sled_brick', 'main', 'sled_push',
 '[{"exercise":"Heavy sled push","distance_m":50,"load_by_division":{"open":"125 kg total","pro":"175 kg total"},"sets":5,"rest_sec":0},{"exercise":"800 m run at Hyrox target pace, straight off the sled","distance_m":800,"sets":5,"rest_sec":180}]'::jsonb,
 'gym', 2, '{compromised_run}', '{compromised,hyrox,sled,legs}'),
('cr_lactate_flush', 'main', 'row',
 '[{"exercise":"1000 m RowErg or SkiErg at hard race pace","distance_m":1000,"sets":4,"rest_sec":0},{"exercise":"1000 m run at controlled threshold pace (Zone 4)","distance_m":1000,"sets":4,"rest_sec":180}]'::jsonb,
 'gym', 3, '{compromised_run}', '{compromised,hyrox,erg,upper_body}'),
('cr_heavy_legs', 'main', 'sandbag_lunges',
 '[{"exercise":"Walking lunges","distance_m":100,"load_by_division":{"open":"10 kg sandbag","pro":"20 kg sandbag"},"sets":3,"rest_sec":0},{"exercise":"1200 m run — first 400 m buffered, last 800 m at race pace","distance_m":1200,"sets":3,"rest_sec":240}]'::jsonb,
 'gym', 3, '{compromised_run}', '{compromised,hyrox,lunges,legs}'),
('cr_micro_sim', 'main', 'general',
 '[{"exercise":"Round 1: Sled pull, then 1000 m at goal race pace","distance_m":1000,"rest_sec":120},{"exercise":"Round 2: Burpee broad jumps, then 1000 m at goal race pace","distance_m":1000,"rest_sec":120},{"exercise":"Round 3: Farmers carry, then 1000 m at goal race pace","distance_m":1000,"rest_sec":120},{"exercise":"Round 4: Wall balls, then 1000 m at goal race pace","distance_m":1000,"rest_sec":0}]'::jsonb,
 'gym', 3, '{compromised_run}', '{compromised,hyrox,simulation,pacing}')

on conflict (slug) do nothing;
