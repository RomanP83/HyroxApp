-- ============================================================================
-- 0036 — Garmin running history for the /progress/running dashboard.
--
-- Filled by POST /api/garmin/import (secret-guarded, service role). This is
-- history for display: nothing here touches the plan or the engine's state.
-- start_local is the watch's local wall time, so weeks bucket on the day the
-- athlete actually ran, whatever the server's time zone.
-- ============================================================================

create table if not exists garmin_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  activity_id bigint not null,
  name text check (char_length(name) <= 200),
  activity_type text not null check (char_length(activity_type) <= 60),
  event_type text check (char_length(event_type) <= 40),
  start_local timestamp not null,
  distance_m numeric not null check (distance_m between 0 and 400000),
  duration_s numeric not null check (duration_s between 0 and 172800),
  avg_hr int check (avg_hr between 20 and 250),
  max_hr int check (max_hr between 20 and 250),
  elevation_gain_m numeric check (elevation_gain_m between 0 and 20000),
  calories int check (calories between 0 and 20000),
  imported_at timestamptz not null default now(),
  unique (profile_id, activity_id)
);

create index if not exists garmin_runs_profile_idx on garmin_runs(profile_id, start_local);

-- One row per day: Garmin's VO2max estimate and its race predictions.
create table if not exists garmin_fitness (
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  on_date date not null,
  vo2max numeric check (vo2max between 10 and 100),
  pred_5k_sec int check (pred_5k_sec between 600 and 7200),
  pred_10k_sec int check (pred_10k_sec between 1200 and 14400),
  pred_half_sec int check (pred_half_sec between 2400 and 36000),
  pred_marathon_sec int check (pred_marathon_sec between 4800 and 72000),
  updated_at timestamptz not null default now(),
  primary key (profile_id, on_date)
);

alter table garmin_runs enable row level security;
alter table garmin_fitness enable row level security;

-- Read your own; writes come only from the import route's service role.
drop policy if exists garmin_runs_read on garmin_runs;
create policy garmin_runs_read on garmin_runs for select
  using (profile_id in (select id from athlete_profiles where user_id = auth.uid()));

drop policy if exists garmin_fitness_read on garmin_fitness;
create policy garmin_fitness_read on garmin_fitness for select
  using (profile_id in (select id from athlete_profiles where user_id = auth.uid()));
