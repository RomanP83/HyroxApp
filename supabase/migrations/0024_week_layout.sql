-- ============================================================================
-- 0024 — the athlete's own week shape.
--
-- Which weekday the long run sits on, which days carry strength, and which
-- days are rest are not training decisions the engine should be making alone:
-- they are gym opening hours, a free Sunday, a standing appointment. The
-- engine keeps deciding WHAT each week contains; the athlete may now decide
-- WHEN some of it happens.
--
-- Hard pin, soft warn: a pinned day is honoured even when it collides with the
-- recovery rules (no two hard endurance days back to back, no strength the day
-- after a hard day). The collision is reported, not silently resolved — see
-- assessWeekPreferences() in src/lib/engine/micro.ts.
--
-- 1 = Monday … 7 = Sunday, the same grid sessions.day_hint uses.
-- ============================================================================

alter table athlete_profiles
  add column if not exists preferred_long_run_day int
    check (preferred_long_run_day between 1 and 7),
  add column if not exists preferred_strength_days int[] not null default '{}',
  add column if not exists preferred_rest_days int[] not null default '{}';
