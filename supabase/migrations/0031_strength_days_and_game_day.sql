-- ============================================================================
-- 0031 — two strength days a week, and a fixed game day.
--
-- strength_per_week: 1 (the default, unchanged) or 2. With 2, the week's
-- lightest slot (mobility, else the recovery run) becomes a second strength
-- day — never a hard session, the long run or the station day; the taper
-- keeps one. micro.ts → addStrengthDays().
--
-- preferred_game_day: the weekday the week's simulation, or else its first
-- compromised run, is pinned to — like preferred_long_run_day. A hard pin;
-- a collision comes back as a warning on the settings page.
-- ============================================================================

alter table athlete_profiles
  add column if not exists strength_per_week int not null default 1
  check (strength_per_week between 1 and 2);

alter table athlete_profiles
  add column if not exists preferred_game_day int
  check (preferred_game_day between 1 and 7);
