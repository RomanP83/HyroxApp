-- ============================================================================
-- 0029 — race results with splits, a target time, and AI coach suggestions.
--
-- The table is called athlete_race_results, not race_results: a Supabase
-- project shared with another app may already have a race_results of its
-- own, and that one must be left alone.
--
-- Race results: a real race or a full simulation, stored with its sixteen
-- segments (8 runs, 8 stations) plus the roxzone. One of them can be the
-- athlete's baseline — the race the target is measured from. Every race
-- analysis (gap per station, pace loss after the burpee broad jumps, readiness)
-- is computed from these rows by src/lib/engine/raceAnalysis.ts; nothing
-- derived is stored.
--
-- Target time: the finish time the athlete is training for. It lives on the
-- profile, not on a season race, so it works without a season calendar.
--
-- AI suggestions: a language model reviews the last weeks and proposes a few
-- changes to upcoming sessions. It proposes only — every item is validated by
-- the engine (src/lib/engine/suggestions.ts) and changes the plan only when
-- the athlete taps "Apply". Rows are written by the server (service role);
-- the athlete can read their own.
--
-- Note for an EXISTING database: this adds the enum value 'ai_suggestion'. A
-- fresh install gets it from 0001, which keeps setup.sql runnable in one
-- transaction — a new enum value may not be used in the transaction that adds
-- it, and nothing here uses it.
-- ============================================================================

-- Guard: a table of the same name from another app must not be altered.
-- If one exists without this migration's columns, stop before changing anything.
do $$
begin
  if to_regclass('public.athlete_race_results') is not null and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'athlete_race_results' and column_name = 'held_on'
  ) then
    raise exception 'Table public.athlete_race_results already exists with a different structure (no column held_on). It is not HyroxApp''s — rename or remove it, or run HyroxApp in its own Supabase project.';
  end if;
  if to_regclass('public.ai_suggestions') is not null and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_suggestions' and column_name = 'review'
  ) then
    raise exception 'Table public.ai_suggestions already exists with a different structure (no column review). It is not HyroxApp''s — rename or remove it, or run HyroxApp in its own Supabase project.';
  end if;
end $$;

alter type adjustment_trigger_t add value if not exists 'ai_suggestion';

alter table athlete_profiles
  add column if not exists target_time_sec int check (target_time_sec between 2400 and 14400);

create table if not exists athlete_race_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  kind text not null check (kind in ('race', 'simulation')),
  held_on date not null,
  label text check (char_length(label) <= 80),
  is_baseline boolean not null default false,
  total_sec int not null check (total_sec between 600 and 21600),
  -- Run 1..8 and station 1..8 in race order (SkiErg, Sled Push, Sled Pull,
  -- BBJ, Row, Farmers Carry, Sandbag Lunges, Wall Balls). Null = not timed.
  runs_sec int[] check (runs_sec is null or array_length(runs_sec, 1) = 8),
  stations_sec int[] check (stations_sec is null or array_length(stations_sec, 1) = 8),
  roxzone_sec int check (roxzone_sec is null or roxzone_sec >= 0),
  created_at timestamptz not null default now()
);
create index if not exists athlete_race_results_profile_idx on athlete_race_results(profile_id, held_on);
create unique index if not exists athlete_race_results_one_baseline_uidx
  on athlete_race_results(profile_id) where is_baseline;

alter table athlete_race_results enable row level security;

drop policy if exists rr_all on athlete_race_results;
create policy rr_all on athlete_race_results for all
  using (owns_profile(profile_id))
  with check (owns_profile(profile_id));

create table if not exists ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  model text not null,
  -- The model's review of the last weeks, plain text.
  review text not null,
  -- [{ id, action, session_id, title, day_hint?, day_slot?, reason,
  --    status: open|applied|dismissed, undo? }] — only items the engine accepted.
  items jsonb not null default '[]'::jsonb,
  -- Proposals the engine refused, with the rule that refused them.
  rejected jsonb not null default '[]'::jsonb
);
create index if not exists ai_suggestions_profile_idx on ai_suggestions(profile_id, created_at desc);

alter table ai_suggestions enable row level security;

drop policy if exists ais_select on ai_suggestions;
create policy ais_select on ai_suggestions for select
  using (owns_profile(profile_id));
