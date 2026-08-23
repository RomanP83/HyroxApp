-- ============================================================================
-- Hyrox Periodization Hub — core schema (Implementation Plan §3)
-- ============================================================================
-- Entity map:
--   users (auth) 1:1 athlete_profiles 1:1 athlete_state
--   athlete_profiles 1:n plans 1:n plan_phases 1:n plan_weeks 1:n sessions
--   sessions n:m workout_blocks (via session_blocks)
--   sessions 1:0..1 session_logs
--   athlete_profiles 1:n benchmark_results
--   plans n:1 races
--   plans 1:n plan_adjustments
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type division_t as enum ('open', 'pro', 'doubles', 'masters_open', 'masters_pro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type experience_level_t as enum ('beginner', 'intermediate', 'advanced', 'elite', 'world_class');
exception when duplicate_object then null; end $$;

do $$ begin
  create type equipment_access_t as enum ('full_gym', 'home_minimal', 'hybrid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_status_t as enum ('active', 'completed', 'paused', 'abandoned', 'rehab');
exception when duplicate_object then null; end $$;

do $$ begin
  create type phase_type_t as enum ('base', 'build', 'peak', 'taper');
exception when duplicate_object then null; end $$;

do $$ begin
  create type week_status_t as enum ('upcoming', 'current', 'completed', 'rebased');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_type_t as enum (
    'long_run', 'run_easy', 'run_intervals', 'compromised_run', 'strength',
    'station_work', 'full_sim', 'mobility', 'benchmark', 'race_day', 'rest'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_status_t as enum ('planned', 'done', 'skipped', 'moved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type block_type_t as enum ('warmup', 'main', 'mobility', 'finisher');
exception when duplicate_object then null; end $$;

do $$ begin
  create type station_t as enum (
    'ski_erg', 'sled_push', 'sled_pull', 'burpee_broad_jump', 'row',
    'farmers_carry', 'sandbag_lunges', 'wall_balls', 'run', 'general'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type equipment_variant_t as enum ('gym', 'home');
exception when duplicate_object then null; end $$;

do $$ begin
  create type benchmark_metric_t as enum ('time_sec', 'reps', 'distance_m');
exception when duplicate_object then null; end $$;

do $$ begin
  create type phase_context_t as enum ('start', 'mid', 'pre_race');
exception when duplicate_object then null; end $$;

do $$ begin
  create type adjustment_layer_t as enum ('micro', 'macro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type adjustment_trigger_t as enum (
    'session_logged', 'missed_session', 'pause', 'acwr_high', 'acwr_low',
    'rpe_trend', 'manual_move', 'injury_flag', 'benchmark_result'
  );
exception when duplicate_object then null; end $$;

-- ── races (scraped event calendar) ──────────────────────────────────────────
create table if not exists races (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  country text,
  event_date date not null,
  division_availability jsonb not null default '{}'::jsonb,
  source_url text,
  scraped_at timestamptz not null default now()
);

-- ── athlete_profiles ────────────────────────────────────────────────────────
create table if not exists athlete_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  division division_t not null default 'open',
  experience_level experience_level_t not null default 'intermediate',
  five_k_seconds int,
  -- { ski_erg_1000m: sec, wall_balls_max: reps, ... } (optional, low onboarding friction)
  station_estimates jsonb not null default '{}'::jsonb,
  training_days_per_week int not null default 4 check (training_days_per_week between 3 and 6),
  equipment_access equipment_access_t not null default 'full_gym',
  telegram_chat_id text,
  created_at timestamptz not null default now()
);

-- ── athlete_state (the "living" fitness state — written only by the engine) ──
create table if not exists athlete_state (
  profile_id uuid primary key references athlete_profiles(id) on delete cascade,
  acute_load_7d numeric not null default 0,     -- sum sRPE last 7 days
  chronic_load_28d numeric not null default 0,  -- avg weekly load last 28 days
  acwr numeric not null default 1.0,            -- acute / chronic
  -- { easy_sec_km, tempo_sec_km, interval_sec_km, race_sec_km }
  pace_zones jsonb not null default '{}'::jsonb,
  -- per-station tiers 1..3 (individualisation — PP2)
  station_tiers jsonb not null default '{}'::jsonb,
  predicted_race_time_sec int,
  last_recalc_at timestamptz not null default now()
);

-- ── plans ───────────────────────────────────────────────────────────────────
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  race_id uuid references races(id) on delete set null,
  race_date date not null,               -- selectable even without an event
  status plan_status_t not null default 'active',
  total_weeks int not null,
  generated_at timestamptz not null default now(),
  engine_version text not null default 'v1.1',  -- important for rule iteration
  stripe_payment_id text
);
create index if not exists plans_profile_idx on plans(profile_id);

-- ── plan_phases ─────────────────────────────────────────────────────────────
create table if not exists plan_phases (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  phase_type phase_type_t not null,
  sort_order int not null,
  start_week int not null,
  end_week int not null,
  focus_description text,
  volume_multiplier numeric not null default 1.0
);
create index if not exists plan_phases_plan_idx on plan_phases(plan_id);

-- ── plan_weeks ──────────────────────────────────────────────────────────────
create table if not exists plan_weeks (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references plan_phases(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete cascade,
  week_number int not null,               -- 1-based, plan-global
  is_deload boolean not null default false,
  is_benchmark_week boolean not null default false,
  weekly_goal text,                       -- the "why this week" explanation (PP1)
  target_sessions int not null default 4,
  status week_status_t not null default 'upcoming'
);
create index if not exists plan_weeks_plan_idx on plan_weeks(plan_id);
create unique index if not exists plan_weeks_plan_week_uidx on plan_weeks(plan_id, week_number);

-- ── sessions ────────────────────────────────────────────────────────────────
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references plan_weeks(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete cascade,
  day_hint int not null default 1 check (day_hint between 1 and 7),  -- movable
  session_type session_type_t not null,
  title text not null,
  planned_duration_min int not null default 45,
  intensity_rpe_target int not null default 6 check (intensity_rpe_target between 1 and 10),
  status session_status_t not null default 'planned',
  sort_order int not null default 0
);
create index if not exists sessions_week_idx on sessions(week_id);
create index if not exists sessions_plan_idx on sessions(plan_id);

-- ── workout_blocks (reusable library — own IP, read-only public) ────────────
create table if not exists workout_blocks (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  block_type block_type_t not null,
  station station_t,
  -- [{ exercise, sets, reps, load_by_division: {open, pro, ...}, distance_m, rest_sec }]
  content jsonb not null default '[]'::jsonb,
  equipment_variant equipment_variant_t not null default 'gym',
  difficulty_tier int not null default 1 check (difficulty_tier between 1 and 3),
  session_types session_type_t[] not null default '{}',
  tags text[] not null default '{}'
);
create index if not exists workout_blocks_station_idx on workout_blocks(station);

-- ── session_blocks (join) ───────────────────────────────────────────────────
create table if not exists session_blocks (
  session_id uuid not null references sessions(id) on delete cascade,
  block_id uuid not null references workout_blocks(id) on delete cascade,
  sort_order int not null default 0,
  -- engine-rendered, profile-specific overrides of template loads
  -- (incl. tier / pace-zone at generation time)
  load_adjustments jsonb not null default '{}'::jsonb,
  primary key (session_id, block_id, sort_order)
);

-- ── session_logs (1-tap logging — PP5) ──────────────────────────────────────
create table if not exists session_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  completed_at timestamptz not null default now(),
  completed_as_planned boolean not null default true,  -- the 1-tap case
  rpe_actual int check (rpe_actual between 1 and 10),
  duration_actual_min int,
  -- only populated on deviation: [{ block_id, load_actual, reps_actual, pace_actual_sec_km }]
  block_results jsonb,
  notes text
);
create unique index if not exists session_logs_session_uidx on session_logs(session_id);

-- ── benchmarks ──────────────────────────────────────────────────────────────
create table if not exists benchmark_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  metric_type benchmark_metric_t not null,
  protocol text
);

create table if not exists benchmark_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  benchmark_id uuid not null references benchmark_definitions(id) on delete cascade,
  plan_id uuid references plans(id) on delete set null,
  phase_context phase_context_t not null default 'start',
  value numeric not null,
  recorded_at timestamptz not null default now()
);
create index if not exists benchmark_results_profile_idx on benchmark_results(profile_id);

-- ── plan_adjustments (audit log of the adaptive engine) ─────────────────────
create table if not exists plan_adjustments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  layer adjustment_layer_t not null,
  trigger adjustment_trigger_t not null,
  -- e.g. { type: "tier_up", station: "wall_balls", from: 1, to: 2 }
  action_taken jsonb not null default '{}'::jsonb,
  reason text,                             -- one-sentence user-facing explanation (PP1)
  created_at timestamptz not null default now()
);
create index if not exists plan_adjustments_plan_idx on plan_adjustments(plan_id);
