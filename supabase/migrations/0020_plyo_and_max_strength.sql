-- ============================================================================
-- Two must-dos the library could not deliver.
--
-- Plyometrics: tendon stiffness and running economy are trained by jumping in
-- a FRESH state. The library only had burpee broad jumps as a station — that is
-- the same movement under fatigue, which trains something else entirely.
--
-- Maximal strength: the strength blocks sat at 4-6 reps and above. Hyrox
-- strength is built on heavy compound lifts in the low single digits; this adds
-- the 3-rep block that was missing.
--
-- Both are finishers/mains attached to STRENGTH sessions (fill.ts), which is
-- where the athlete is rested enough for them to do their job.
-- ============================================================================

insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values

-- Plyometrics, in a rested state — before the fatiguing part of the session.
('fin_plyo_tendon', 'finisher', 'burpee_broad_jump',
 '[{"exercise":"Standing broad jumps — maximum distance, soft landing, full reset between reps","reps":3,"sets":5,"rest_sec":90},{"exercise":"Pogo jumps — stiff ankles, minimal ground contact, no deep knee bend","reps":20,"sets":3,"rest_sec":60}]'::jsonb,
 'gym', 2, '{strength}', '{plyometrics,tendon,economy,fresh}'),

-- Grip, isolated: the station that quietly ends sleds, carries and lunges.
('fin_grip_dedicated', 'finisher', 'farmers_carry',
 '[{"exercise":"Dead hang — full grip, shoulders active","reps":45,"sets":3,"rest_sec":60},{"exercise":"Farmers hold at race weight","reps":45,"load_by_division":{"open":"2x24 kg","pro":"2x32 kg"},"sets":3,"rest_sec":60},{"exercise":"Farmers walk, heavy","distance_m":40,"load_by_division":{"open":"2x28 kg","pro":"2x38 kg"},"sets":3,"rest_sec":90}]'::jsonb,
 'gym', 2, '{strength}', '{grip,carry,finisher}'),

-- Maximal strength: heavy compound lifts in the low single digits.
('str_max_strength', 'main', 'general',
 '[{"exercise":"Back squat","sets":4,"reps":3,"load_by_division":{"open":"85% 1RM","pro":"88% 1RM"},"rest_sec":210},{"exercise":"Deadlift","sets":3,"reps":3,"load_by_division":{"open":"85% 1RM","pro":"88% 1RM"},"rest_sec":210},{"exercise":"Bulgarian split squat","sets":3,"reps":6,"load_by_division":{"open":"2x20 kg","pro":"2x28 kg"},"rest_sec":120}]'::jsonb,
 'gym', 3, '{strength}', '{max_strength,compound,lower}'),
('str_power_primer', 'main', 'general',
 '[{"exercise":"Trap-bar deadlift, fast concentric","sets":4,"reps":2,"load_by_division":{"open":"70% 1RM","pro":"75% 1RM"},"rest_sec":180},{"exercise":"Box jumps, step down","reps":4,"sets":4,"rest_sec":120}]'::jsonb,
 'gym', 1, '{strength}', '{power,priming,taper}')

on conflict (slug) do nothing;
