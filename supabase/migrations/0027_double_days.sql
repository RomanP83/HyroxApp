-- ============================================================================
-- 0027 — the athlete picks the double days too.
--
-- Which days carry a second session was decided entirely by the engine: the
-- strength and station mornings first (their PM partner is an easy run, which
-- is the aerobic volume a Hyrox week runs short of), then the hard days, and
-- an easy day last of all — that one is the week's recovery and gets nothing
-- attached. Sound as a default, and useless to someone whose Tuesday evening
-- is simply the only evening they have.
--
-- Same contract as 0024: hard pin, soft warn. A pinned double day is honoured
-- even where the ranking above would have refused it, and what that costs
-- comes back as a warning — see assessWeekPreferences() in micro.ts.
--
-- The hard/easy alternation is not at risk here and cannot be: a PM session is
-- drawn from a light pool only (pmTypeFor() returns an easy run or mobility),
-- and the days are laid out before any double is attached. What a pin can cost
-- is the quality of a recovery day, which is what the warnings are about.
--
-- 1 = Monday … 7 = Sunday, the same grid sessions.day_hint uses.
-- ============================================================================

alter table athlete_profiles
  add column if not exists preferred_double_days int[] not null default '{}';
