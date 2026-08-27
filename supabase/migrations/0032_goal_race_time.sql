-- ============================================================================
-- 0032 — the goal time gets its own number.
--
-- Until now an athlete's target existed only as a label on the level control
-- ("Competitive · sub 1:20") and as a dead string in running.ts. One control
-- was doing two jobs: the level steers the training mix, the catalogues, the
-- session frequency and the default tiers — that is ABILITY — while its label
-- claimed to be an AMBITION. Someone who runs 1:30 and wants sub 70 had no
-- honest option: "elite" hands them sessions they cannot finish, "intermediate"
-- never shows them their goal.
--
-- With the goal stored as seconds, the app can finally put its own prediction
-- next to what the athlete actually asked for, and say where the missing
-- minutes are.
--
-- Nullable: existing athletes are seeded from their level's target the next
-- time they save, and nobody is made to answer a new question first.
-- ============================================================================

alter table athlete_profiles
  add column if not exists goal_race_time_sec int
    check (goal_race_time_sec is null or goal_race_time_sec between 1800 and 21600);
