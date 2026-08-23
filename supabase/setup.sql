-- ============================================================================
-- Hyrox Periodization Hub — complete database setup, in one file.
--
-- HOW TO USE: open your Supabase project → SQL Editor → New query →
-- paste this entire file → Run. It is safe to run twice (everything is
-- guarded with "if not exists" / "on conflict do nothing").
--
-- Contents: schema, row-level security, the plan-persistence function,
-- engine config, and the seeded workout library + benchmark definitions.
-- Generated from supabase/migrations/*.sql + supabase/seed/*.sql.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0001_schema.sql
-- ─────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0002_rls.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Row Level Security (Implementation Plan §3: "RLS überall, user-scoped;
-- Templates/Bibliothek read-only public")
-- ============================================================================
-- Ownership is anchored on athlete_profiles.user_id = auth.uid().
-- The service-role key (webhooks / engine) bypasses RLS entirely, so
-- athlete_state and plan_adjustments are written server-side.
-- ============================================================================

alter table athlete_profiles   enable row level security;
alter table athlete_state      enable row level security;
alter table plans              enable row level security;
alter table plan_phases        enable row level security;
alter table plan_weeks         enable row level security;
alter table sessions           enable row level security;
alter table session_blocks     enable row level security;
alter table session_logs       enable row level security;
alter table benchmark_results  enable row level security;
alter table plan_adjustments   enable row level security;
alter table races              enable row level security;
alter table workout_blocks     enable row level security;
alter table benchmark_definitions enable row level security;

-- Helper: does the current user own this profile id?
create or replace function owns_profile(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from athlete_profiles ap
    where ap.id = p and ap.user_id = auth.uid()
  );
$$;

-- Helper: does the current user own this plan id?
create or replace function owns_plan(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from plans pl
    join athlete_profiles ap on ap.id = pl.profile_id
    where pl.id = p and ap.user_id = auth.uid()
  );
$$;

-- ── athlete_profiles ────────────────────────────────────────────────────────
drop policy if exists ap_select on athlete_profiles;
create policy ap_select on athlete_profiles for select using (user_id = auth.uid());
drop policy if exists ap_insert on athlete_profiles;
create policy ap_insert on athlete_profiles for insert with check (user_id = auth.uid());
drop policy if exists ap_update on athlete_profiles;
create policy ap_update on athlete_profiles for update using (user_id = auth.uid());

-- ── athlete_state (read own; writes go through service role) ─────────────────
drop policy if exists as_select on athlete_state;
create policy as_select on athlete_state for select using (owns_profile(profile_id));

-- ── plans ───────────────────────────────────────────────────────────────────
drop policy if exists plans_select on plans;
create policy plans_select on plans for select using (owns_profile(profile_id));
drop policy if exists plans_cud on plans;
create policy plans_cud on plans for all using (owns_profile(profile_id)) with check (owns_profile(profile_id));

-- ── plan_phases / plan_weeks / sessions (scoped via plan) ───────────────────
drop policy if exists phases_all on plan_phases;
create policy phases_all on plan_phases for all using (owns_plan(plan_id)) with check (owns_plan(plan_id));
drop policy if exists weeks_all on plan_weeks;
create policy weeks_all on plan_weeks for all using (owns_plan(plan_id)) with check (owns_plan(plan_id));
drop policy if exists sessions_all on sessions;
create policy sessions_all on sessions for all using (owns_plan(plan_id)) with check (owns_plan(plan_id));

-- ── session_blocks (scoped via its session's plan) ──────────────────────────
drop policy if exists session_blocks_all on session_blocks;
create policy session_blocks_all on session_blocks for all using (
  exists (select 1 from sessions s where s.id = session_id and owns_plan(s.plan_id))
) with check (
  exists (select 1 from sessions s where s.id = session_id and owns_plan(s.plan_id))
);

-- ── session_logs (user logs their own sessions) ─────────────────────────────
drop policy if exists session_logs_all on session_logs;
create policy session_logs_all on session_logs for all using (
  exists (select 1 from sessions s where s.id = session_id and owns_plan(s.plan_id))
) with check (
  exists (select 1 from sessions s where s.id = session_id and owns_plan(s.plan_id))
);

-- ── benchmark_results ───────────────────────────────────────────────────────
drop policy if exists benchmark_results_all on benchmark_results;
create policy benchmark_results_all on benchmark_results for all using (owns_profile(profile_id)) with check (owns_profile(profile_id));

-- ── plan_adjustments (read own; writes go through service role) ─────────────
drop policy if exists plan_adjustments_select on plan_adjustments;
create policy plan_adjustments_select on plan_adjustments for select using (owns_plan(plan_id));

-- ── read-only public reference data ─────────────────────────────────────────
drop policy if exists races_read on races;
create policy races_read on races for select using (true);
drop policy if exists workout_blocks_read on workout_blocks;
create policy workout_blocks_read on workout_blocks for select using (true);
drop policy if exists benchmark_definitions_read on benchmark_definitions;
create policy benchmark_definitions_read on benchmark_definitions for select using (true);

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0003_session_feedback.sql
-- ─────────────────────────────────────────────────────────────────────
-- Post-session training feedback (fulfillment index, IST-SOLL metrics, coach
-- text). Computed by the engine at log time and cached here so the card can be
-- re-shown without recomputation.
alter table session_logs add column if not exists feedback jsonb;

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0004_persist_plan_rpc.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- persist_plan RPC (Roadmap A4 + A8, fixes K4 + M7)
-- Writes the full engine-generated plan tree (plan -> phases -> weeks ->
-- sessions -> session_blocks) in ONE transaction: no orphaned partial plans,
-- one network roundtrip instead of ~100 sequential inserts.
-- SECURITY DEFINER bypasses RLS, so ownership is enforced explicitly against
-- auth.uid(). Previous active/paused plans of the profile are abandoned in the
-- same transaction (a re-generate replaces the old race cycle).
-- ============================================================================

create or replace function persist_plan(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := (p->>'profile_id')::uuid;
  v_plan uuid;
  v_phase uuid;
  v_week uuid;
  v_session uuid;
  phase jsonb;
  wk jsonb;
  sess jsonb;
begin
  if not exists (
    select 1 from athlete_profiles ap
    where ap.id = v_profile and ap.user_id = auth.uid()
  ) then
    raise exception 'not_authorized';
  end if;

  -- A8: a fresh generation supersedes older race cycles for this profile.
  update plans set status = 'abandoned'
  where profile_id = v_profile and status in ('active', 'paused');

  insert into plans (profile_id, race_id, race_date, status, total_weeks, engine_version, stripe_payment_id)
  values (
    v_profile,
    nullif(p->>'race_id', '')::uuid,
    (p->>'race_date')::date,
    coalesce(nullif(p->>'status', ''), 'active')::plan_status_t,
    (p->>'total_weeks')::int,
    coalesce(nullif(p->>'engine_version', ''), 'v1.2'),
    nullif(p->>'stripe_payment_id', '')
  )
  returning id into v_plan;

  for phase in select * from jsonb_array_elements(p->'phases') loop
    insert into plan_phases (plan_id, phase_type, sort_order, start_week, end_week, focus_description, volume_multiplier)
    values (
      v_plan,
      (phase->>'phase_type')::phase_type_t,
      (phase->>'sort_order')::int,
      (phase->>'start_week')::int,
      (phase->>'end_week')::int,
      phase->>'focus_description',
      (phase->>'volume_multiplier')::numeric
    )
    returning id into v_phase;

    for wk in select * from jsonb_array_elements(phase->'weeks') loop
      insert into plan_weeks (phase_id, plan_id, week_number, is_deload, is_benchmark_week, weekly_goal, target_sessions, status)
      values (
        v_phase,
        v_plan,
        (wk->>'week_number')::int,
        coalesce((wk->>'is_deload')::bool, false),
        coalesce((wk->>'is_benchmark_week')::bool, false),
        wk->>'weekly_goal',
        coalesce((wk->>'target_sessions')::int, 4),
        case when (wk->>'week_number')::int = 1 then 'current' else 'upcoming' end::week_status_t
      )
      returning id into v_week;

      for sess in select * from jsonb_array_elements(wk->'sessions') loop
        insert into sessions (week_id, plan_id, day_hint, session_type, title, planned_duration_min, intensity_rpe_target, sort_order)
        values (
          v_week,
          v_plan,
          (sess->>'day_hint')::int,
          (sess->>'session_type')::session_type_t,
          sess->>'title',
          (sess->>'planned_duration_min')::int,
          (sess->>'intensity_rpe_target')::int,
          coalesce((sess->>'sort_order')::int, 0)
        )
        returning id into v_session;

        insert into session_blocks (session_id, block_id, sort_order, load_adjustments)
        select
          v_session,
          (b->>'block_id')::uuid,
          coalesce((b->>'sort_order')::int, 0),
          coalesce(b->'load_adjustments', '{}'::jsonb)
        from jsonb_array_elements(coalesce(sess->'blocks', '[]'::jsonb)) b;
      end loop;
    end loop;
  end loop;

  return v_plan;
end;
$$;

revoke all on function persist_plan(jsonb) from public;
grant execute on function persist_plan(jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0005_athlete_state_v12.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Engine v1.2 state fields (Roadmap A6 + A7, fixes M3 + M4)
-- strength_modifier: persisted +-5%-per-step multiplier the strength
--   calibration actually applies (previously only audited, never applied).
-- pace_zones_ref / pace_ref_at: weekly snapshot of the pace zones so the
--   +-3% cap holds per WEEK (plan §5), not per individual log.
-- ============================================================================

alter table athlete_state
  add column if not exists strength_modifier numeric not null default 1.0,
  add column if not exists pace_zones_ref jsonb not null default '{}'::jsonb,
  add column if not exists pace_ref_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0006_persist_plan_service_role.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- persist_plan v2 (Roadmap B3): allow the service role to call the function
-- so the nightly macro cron can REBASE — regenerate a plan from today.
-- Ownership is still enforced for authenticated users; a caller without a JWT
-- uid is the service role (anon/public have no execute grant).
-- ============================================================================

create or replace function persist_plan(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := (p->>'profile_id')::uuid;
  v_plan uuid;
  v_phase uuid;
  v_week uuid;
  v_session uuid;
  phase jsonb;
  wk jsonb;
  sess jsonb;
begin
  if auth.uid() is not null and not exists (
    select 1 from athlete_profiles ap
    where ap.id = v_profile and ap.user_id = auth.uid()
  ) then
    raise exception 'not_authorized';
  end if;

  update plans set status = 'abandoned'
  where profile_id = v_profile and status in ('active', 'paused', 'rehab');

  insert into plans (profile_id, race_id, race_date, status, total_weeks, engine_version, stripe_payment_id)
  values (
    v_profile,
    nullif(p->>'race_id', '')::uuid,
    (p->>'race_date')::date,
    coalesce(nullif(p->>'status', ''), 'active')::plan_status_t,
    (p->>'total_weeks')::int,
    coalesce(nullif(p->>'engine_version', ''), 'v1.2'),
    nullif(p->>'stripe_payment_id', '')
  )
  returning id into v_plan;

  for phase in select * from jsonb_array_elements(p->'phases') loop
    insert into plan_phases (plan_id, phase_type, sort_order, start_week, end_week, focus_description, volume_multiplier)
    values (
      v_plan,
      (phase->>'phase_type')::phase_type_t,
      (phase->>'sort_order')::int,
      (phase->>'start_week')::int,
      (phase->>'end_week')::int,
      phase->>'focus_description',
      (phase->>'volume_multiplier')::numeric
    )
    returning id into v_phase;

    for wk in select * from jsonb_array_elements(phase->'weeks') loop
      insert into plan_weeks (phase_id, plan_id, week_number, is_deload, is_benchmark_week, weekly_goal, target_sessions, status)
      values (
        v_phase,
        v_plan,
        (wk->>'week_number')::int,
        coalesce((wk->>'is_deload')::bool, false),
        coalesce((wk->>'is_benchmark_week')::bool, false),
        wk->>'weekly_goal',
        coalesce((wk->>'target_sessions')::int, 4),
        case when (wk->>'week_number')::int = 1 then 'current' else 'upcoming' end::week_status_t
      )
      returning id into v_week;

      for sess in select * from jsonb_array_elements(wk->'sessions') loop
        insert into sessions (week_id, plan_id, day_hint, session_type, title, planned_duration_min, intensity_rpe_target, sort_order)
        values (
          v_week,
          v_plan,
          (sess->>'day_hint')::int,
          (sess->>'session_type')::session_type_t,
          sess->>'title',
          (sess->>'planned_duration_min')::int,
          (sess->>'intensity_rpe_target')::int,
          coalesce((sess->>'sort_order')::int, 0)
        )
        returning id into v_session;

        insert into session_blocks (session_id, block_id, sort_order, load_adjustments)
        select
          v_session,
          (b->>'block_id')::uuid,
          coalesce((b->>'sort_order')::int, 0),
          coalesce(b->'load_adjustments', '{}'::jsonb)
        from jsonb_array_elements(coalesce(sess->'blocks', '[]'::jsonb)) b;
      end loop;
    end loop;
  end loop;

  return v_plan;
end;
$$;

revoke all on function persist_plan(jsonb) from public;
grant execute on function persist_plan(jsonb) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0007_engine_config_kpis.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Phase D2: engine tuning without deploys + beta KPIs (plan §5/§7)
--
-- engine_config: the calibration constants ("Startwerte aus der Literatur")
-- per engine_version. The server merges this over the compiled defaults, so
-- beta tuning is an UPDATE on this table instead of a code deploy — while the
-- engine itself stays deterministic (same config -> same behavior).
-- Writes go through the service role only; reads are public like the library.
-- ============================================================================

create table if not exists engine_config (
  engine_version text primary key,
  config jsonb not null default '{}'::jsonb,
  notes text,
  updated_at timestamptz not null default now()
);

alter table engine_config enable row level security;
drop policy if exists engine_config_read on engine_config;
create policy engine_config_read on engine_config for select using (true);

-- Seed the current version with the literature defaults (mirrors
-- DEFAULT_TUNING in src/lib/engine/constants.ts).
insert into engine_config (engine_version, config, notes) values (
  'v1.2',
  '{
    "rpe_delta_up_threshold": -2,
    "rpe_delta_down_threshold": 2,
    "pace_step_sec_km": 5,
    "pace_weekly_cap_pct": 0.03,
    "pace_ref_window_days": 7,
    "strength_step": 0.05,
    "strength_modifier_min": 0.8,
    "strength_modifier_max": 1.2,
    "acwr_soft": 1.3,
    "acwr_hard": 1.5,
    "acwr_low": 0.8,
    "acwr_soft_trim": 0.85,
    "rpe_high_14d": 8.5,
    "inactive_rebase_days": 7
  }'::jsonb,
  'Literature starting values — tune during beta with real logs (§7).'
) on conflict (engine_version) do nothing;

-- ============================================================================
-- Beta KPI view (§7): most important metric is the share of logs with REAL
-- RPE input — athletes who 1-tap everything get the macro-only experience.
-- security_invoker: normal users see only their own rows via RLS; the
-- service role (admin route) sees the global numbers.
-- ============================================================================
create or replace view beta_kpis
with (security_invoker = true) as
select
  count(*)::int as logs_total,
  count(*) filter (where not sl.completed_as_planned)::int as logs_with_real_rpe,
  round(
    100.0 * count(*) filter (where not sl.completed_as_planned) / greatest(count(*), 1),
    1
  ) as real_rpe_pct,
  count(distinct s.plan_id)::int as plans_with_logs
from session_logs sl
join sessions s on s.id = sl.session_id;

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0008_strava_subscription.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Phase C2 + C4: Strava connection and subscription tier.
-- Strava tokens live on the profile (engine-adjacent, written server-side via
-- service role only — the RLS update policy already limits users to their own
-- row, and tokens are never sent to the browser).
-- ============================================================================

alter table athlete_profiles
  add column if not exists strava_athlete_id bigint,
  add column if not exists strava_access_token text,
  add column if not exists strava_refresh_token text,
  add column if not exists strava_expires_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists subscription_id text,
  add column if not exists subscription_status text;

create index if not exists athlete_profiles_strava_idx
  on athlete_profiles(strava_athlete_id);

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0009_garmin.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Garmin Connect sync — runs only (user request; extends the C2 pattern).
-- Tokens are server-side only, same handling as the Strava columns.
-- ============================================================================

alter table athlete_profiles
  add column if not exists garmin_user_id text,
  add column if not exists garmin_access_token text,
  add column if not exists garmin_refresh_token text,
  add column if not exists garmin_expires_at timestamptz;

create index if not exists athlete_profiles_garmin_idx
  on athlete_profiles(garmin_user_id);

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0010_session_reset.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Undo a logged day (PP3/PP5 — a mis-tap must not silently reshape the plan)
--
-- Logging a session ("As planned" / "Harder" / "Easier") runs Layer-1
-- micro-calibration, which mutates athlete_state (tiers, pace zones, strength
-- modifier, loads). To take a single day back we need two things:
--
--   session_logs.state_before   snapshot of the engine-owned state fields as
--                               they were BEFORE this log was calibrated in.
--                               Reset restores it, then replays every later
--                               log so the chain stays deterministic.
--   plan_adjustments.session_id which log produced an audit row, so the reset
--                               can drop exactly the rows it rolls back
--                               (manual moves / macro rows keep session_id null).
-- ============================================================================

alter table session_logs
  add column if not exists state_before jsonb;

alter table plan_adjustments
  add column if not exists session_id uuid references sessions(id) on delete cascade;

create index if not exists plan_adjustments_session_idx
  on plan_adjustments(session_id);

-- Audit trigger for the manual reset itself ("Why your plan changed" — PP1).
alter type adjustment_trigger_t add value if not exists 'manual_reset';

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0011_knowledge_pipeline.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Knowledge pipeline: PDFs (studies, articles, training literature) become
-- REVIEWED, structured input for the engine — never raw context at generation
-- time (§7 + "no LLM in the plan core").
--
-- Flow:  upload -> extract (Claude reads the PDF) -> proposals -> operator
--        review -> apply into workout_blocks / engine_config.
--
-- Three proposal kinds, mapped to the two places the engine actually reads:
--   block      -> workout_blocks   (library the fill layer picks from)
--   tuning     -> engine_config    (calibration constants, merged over defaults)
--   principle  -> nothing automatic. Research note for the operator; a
--                 third-party programme may never become a block (§7:
--                 principles are not protectable, concrete plans are).
--
-- Operator-only data: RLS is on and NO policy exists, so anon/authenticated
-- see nothing at all. Every access goes through the service role behind the
-- CRON_SECRET-guarded /api/admin routes.
-- ============================================================================

do $$ begin
  create type knowledge_license_t as enum ('own', 'licensed', 'research_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type knowledge_doc_status_t as enum ('uploaded', 'extracted', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type proposal_kind_t as enum ('block', 'tuning', 'principle');
exception when duplicate_object then null; end $$;

do $$ begin
  create type proposal_status_t as enum ('pending', 'approved', 'applied', 'rejected', 'failed');
exception when duplicate_object then null; end $$;

-- ── knowledge_documents ─────────────────────────────────────────────────────
create table if not exists knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  filename text not null,
  -- Path inside the private `knowledge` storage bucket.
  storage_path text not null,
  -- Dedupe: the same PDF uploaded twice is rejected, not re-extracted.
  sha256 text not null unique,
  bytes int not null default 0,
  -- 'research_only' documents can never produce block proposals (§7).
  license knowledge_license_t not null default 'research_only',
  status knowledge_doc_status_t not null default 'uploaded',
  summary text,
  error text,
  notes text,
  uploaded_at timestamptz not null default now(),
  extracted_at timestamptz
);

-- ── knowledge_proposals ─────────────────────────────────────────────────────
create table if not exists knowledge_proposals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  kind proposal_kind_t not null,
  status proposal_status_t not null default 'pending',
  -- One-line what-it-is, shown in the review list.
  summary text not null,
  -- Why the document supports it, in the extractor's words.
  rationale text,
  -- Verbatim evidence + where it sits in the PDF, so review is one lookup.
  quote text,
  page int,
  confidence numeric,
  -- The typed change itself (block row / tuning key+value / principle topic).
  payload jsonb not null default '{}'::jsonb,
  -- Audit of the apply step.
  applied_at timestamptz,
  applied_ref jsonb,      -- { table, id } / { engine_version, key }
  applied_before jsonb,   -- previous value, so a tuning change is revertible
  reviewer_note text,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_proposals_doc_idx on knowledge_proposals(document_id);
create index if not exists knowledge_proposals_status_idx on knowledge_proposals(status);

-- Operator-only: RLS on, no policies → service role is the sole reader/writer.
alter table knowledge_documents enable row level security;
alter table knowledge_proposals enable row level security;

-- ── Private storage bucket for the source PDFs ──────────────────────────────
-- Guarded so the file also runs on a database without the storage schema.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('knowledge', 'knowledge', false)
    on conflict (id) do nothing;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0012_season_periodisation.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Season layer: the annual periodisation above the 4-20 week plan.
--
--   seasons 1:n season_races   (the calendar the athlete gives us)
--   seasons 1:n season_blocks  (the macro/mesocycles the engine derives)
--
-- The blocks are computed by src/lib/engine/season.ts — deterministic, so a
-- season is always reproducible from (start_date, races, weaknesses). They are
-- stored anyway: the plan page, the coach text and later the weekly generator
-- all need to know which block a given week belongs to without recomputing.
-- ============================================================================

do $$ begin
  create type race_priority_t as enum ('A', 'B', 'C');
exception when duplicate_object then null; end $$;

do $$ begin
  create type season_block_kind_t as enum (
    'post_race_recovery', 'base', 'build', 'race_specific', 'bridge', 'taper', 'open_base'
  );
exception when duplicate_object then null; end $$;

-- The athlete's own list of weaknesses ("Sled Push", "Laktattoleranz") — the
-- season planner routes each one to the block that is the right place for it.
alter table athlete_profiles
  add column if not exists weaknesses text[] not null default '{}';

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  total_weeks int not null,
  horizon_weeks int not null default 52,
  engine_version text not null default 'v1.2',
  -- Coach-facing notes about the decisions the planner had to make (PP1).
  notes jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now()
);
create index if not exists seasons_profile_idx on seasons(profile_id);

create table if not exists season_races (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  sort_order int not null default 0,
  race_date date not null,
  race_type text not null,
  priority race_priority_t not null default 'A',
  -- Season-global week the race falls in, and whether it anchors a macrocycle
  -- (an A race gets a real taper; a B/C race is a hard training day).
  week_number int not null,
  is_anchor boolean not null default false,
  race_id uuid references races(id) on delete set null,
  plan_id uuid references plans(id) on delete set null
);
create index if not exists season_races_season_idx on season_races(season_id);

create table if not exists season_blocks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  -- Macrocycle = one race cycle (or the open tail); blocks are its mesocycles.
  macrocycle_sort int not null default 0,
  macrocycle_label text not null default '',
  target_race_index int,
  sort_order int not null default 0,
  kind season_block_kind_t not null,
  start_week int not null,
  end_week int not null,
  weeks int not null,
  start_date date not null,
  end_date date not null,
  volume_multiplier numeric not null default 1.0,
  focus text not null default '',
  key_sessions text[] not null default '{}',
  weakness_targets text[] not null default '{}',
  deload_weeks int[] not null default '{}'
);
create index if not exists season_blocks_season_idx on season_blocks(season_id);

-- ── RLS: a season belongs to its athlete, like plans ────────────────────────
alter table seasons enable row level security;
alter table season_races enable row level security;
alter table season_blocks enable row level security;

drop policy if exists seasons_all on seasons;
create policy seasons_all on seasons for all
  using (owns_profile(profile_id)) with check (owns_profile(profile_id));

drop policy if exists season_races_all on season_races;
create policy season_races_all on season_races for all using (
  exists (select 1 from seasons s where s.id = season_id and owns_profile(s.profile_id))
) with check (
  exists (select 1 from seasons s where s.id = season_id and owns_profile(s.profile_id))
);

drop policy if exists season_blocks_all on season_blocks;
create policy season_blocks_all on season_blocks for all using (
  exists (select 1 from seasons s where s.id = season_id and owns_profile(s.profile_id))
) with check (
  exists (select 1 from seasons s where s.id = season_id and owns_profile(s.profile_id))
);

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0013_knowledge_text_sources.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Knowledge sources that are not PDFs.
--
-- Two ways to hand the app information that has ALREADY been read and analysed
-- somewhere else (another AI, a coach's notes, a summary):
--
--   'note'      free text. The extractor structures it into proposals, exactly
--               as it does for a PDF — only the input differs.
--   'proposals' finished proposals in the app's own JSON contract. Nothing is
--               generated: the payload is validated and filed for review, so
--               no model runs and no tokens are spent.
--
-- Both land in the same review queue as a PDF, and the same apply path writes
-- them into workout_blocks / engine_config. Review stays the single gate.
-- ============================================================================

do $$ begin
  create type knowledge_source_t as enum ('pdf', 'note', 'proposals');
exception when duplicate_object then null; end $$;

alter table knowledge_documents
  add column if not exists source_type knowledge_source_t not null default 'pdf',
  -- The pasted text / raw JSON, kept so a reviewer can read the source that
  -- produced a proposal without leaving the app.
  add column if not exists body text;

-- Only a PDF has a file behind it.
alter table knowledge_documents alter column storage_path drop not null;

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0014_double_days.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Double days (AM / PM).
--
-- A training day could only ever hold one session: the generator emits exactly
-- `training_days_per_week` sessions and gives each its own day, and nothing in
-- the schema said what "second session of the day" would even mean.
--
--   sessions.day_slot                which half of the day a session sits in
--   athlete_profiles.doubles_per_week how many days may carry a second session
--
-- The unique index is the invariant: one AM and one PM per day, never more.
-- persist_plan is replaced so the generated day_slot survives persistence
-- (older plans default to 'am', which is exactly what they were).
-- ============================================================================

do $$ begin
  create type day_slot_t as enum ('am', 'pm');
exception when duplicate_object then null; end $$;

alter table sessions
  add column if not exists day_slot day_slot_t not null default 'am';

-- 0..3 second sessions per week. Volume lives here, not in a 7th training day.
alter table athlete_profiles
  add column if not exists doubles_per_week int not null default 0
    check (doubles_per_week between 0 and 3);

-- Existing data first: the move API could already put two sessions on one day
-- (nothing enforced otherwise). Give the second one the PM slot, ordered by the
-- plan's own sequence, so the unique index below can be created on live data.
-- Guarded so this file stays re-runnable: once the uniqueness rule exists, the
-- data is already in shape. Re-running it afterwards would rank by sort_order,
-- which a later move (0022) deliberately does NOT swap — it could hand the AM
-- session the PM slot and collide with the PM one that is already there.
do $$
begin
  if not exists (select 1 from pg_class where relname = 'sessions_week_day_slot_uidx')
     and not exists (select 1 from pg_constraint where conname = 'sessions_week_day_slot_uniq')
  then
    update sessions s
    set day_slot = 'pm'
    from (
      select id, row_number() over (partition by week_id, day_hint order by sort_order, id) as rn
      from sessions
    ) ranked
    where ranked.id = s.id and ranked.rn = 2;
  end if;
end $$;

create unique index if not exists sessions_week_day_slot_uidx
  on sessions(week_id, day_hint, day_slot);

create or replace function persist_plan(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := (p->>'profile_id')::uuid;
  v_plan uuid;
  v_phase uuid;
  v_week uuid;
  v_session uuid;
  phase jsonb;
  wk jsonb;
  sess jsonb;
begin
  if auth.uid() is not null and not exists (
    select 1 from athlete_profiles ap
    where ap.id = v_profile and ap.user_id = auth.uid()
  ) then
    raise exception 'not_authorized';
  end if;

  update plans set status = 'abandoned'
  where profile_id = v_profile and status in ('active', 'paused', 'rehab');

  insert into plans (profile_id, race_id, race_date, status, total_weeks, engine_version, stripe_payment_id)
  values (
    v_profile,
    nullif(p->>'race_id', '')::uuid,
    (p->>'race_date')::date,
    coalesce(nullif(p->>'status', ''), 'active')::plan_status_t,
    (p->>'total_weeks')::int,
    coalesce(nullif(p->>'engine_version', ''), 'v1.2'),
    nullif(p->>'stripe_payment_id', '')
  )
  returning id into v_plan;

  for phase in select * from jsonb_array_elements(p->'phases') loop
    insert into plan_phases (plan_id, phase_type, sort_order, start_week, end_week, focus_description, volume_multiplier)
    values (
      v_plan,
      (phase->>'phase_type')::phase_type_t,
      (phase->>'sort_order')::int,
      (phase->>'start_week')::int,
      (phase->>'end_week')::int,
      phase->>'focus_description',
      (phase->>'volume_multiplier')::numeric
    )
    returning id into v_phase;

    for wk in select * from jsonb_array_elements(phase->'weeks') loop
      insert into plan_weeks (phase_id, plan_id, week_number, is_deload, is_benchmark_week, weekly_goal, target_sessions, status)
      values (
        v_phase,
        v_plan,
        (wk->>'week_number')::int,
        coalesce((wk->>'is_deload')::bool, false),
        coalesce((wk->>'is_benchmark_week')::bool, false),
        wk->>'weekly_goal',
        coalesce((wk->>'target_sessions')::int, 4),
        case when (wk->>'week_number')::int = 1 then 'current' else 'upcoming' end::week_status_t
      )
      returning id into v_week;

      for sess in select * from jsonb_array_elements(wk->'sessions') loop
        insert into sessions (week_id, plan_id, day_hint, day_slot, session_type, title, planned_duration_min, intensity_rpe_target, sort_order)
        values (
          v_week,
          v_plan,
          (sess->>'day_hint')::int,
          coalesce(nullif(sess->>'day_slot', ''), 'am')::day_slot_t,
          (sess->>'session_type')::session_type_t,
          sess->>'title',
          (sess->>'planned_duration_min')::int,
          (sess->>'intensity_rpe_target')::int,
          coalesce((sess->>'sort_order')::int, 0)
        )
        returning id into v_session;

        insert into session_blocks (session_id, block_id, sort_order, load_adjustments)
        select
          v_session,
          (b->>'block_id')::uuid,
          coalesce((b->>'sort_order')::int, 0),
          coalesce(b->'load_adjustments', '{}'::jsonb)
        from jsonb_array_elements(coalesce(sess->'blocks', '[]'::jsonb)) b;
      end loop;
    end loop;
  end loop;

  return v_plan;
end;
$$;

revoke all on function persist_plan(jsonb) from public;
grant execute on function persist_plan(jsonb) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0015_strength_templates.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Personal strength programming.
--
-- The workout_blocks library is shared IP with per-division loads. An athlete's
-- own strength day is the opposite: their exercises, their kilos, their rep
-- ranges. It gets its own tables, owned by the athlete.
--
--   strength_templates   "Tag A: Oberkörper" — one training day
--   strength_exercises   the rows of that day, in order
--   strength_set_logs    what actually happened, set by set
--
-- Progression suggests, it never overwrites: a computed next load lands in
-- suggested_load_kg and only moves into load_kg when the athlete accepts it.
-- ============================================================================

create table if not exists strength_templates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  name text not null,
  -- Rotation order when several days exist (A, B, C …).
  sort_order int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists strength_templates_profile_idx on strength_templates(profile_id);

create table if not exists strength_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references strength_templates(id) on delete cascade,
  position int not null default 0,
  name text not null,
  sets int not null default 3 check (sets between 1 and 12),
  -- Rep range: "6 - 8" -> 6/8. Equal values for a fixed rep count.
  rep_min int check (rep_min > 0),
  rep_max int check (rep_max > 0),
  -- null = bodyweight (the Dips row of a typical sheet).
  load_kg numeric check (load_kg >= 0),
  -- Exercises sharing a group are done back to back (superset).
  superset_group text,
  notes text,
  -- An open progression suggestion, waiting for the athlete's decision.
  suggested_load_kg numeric check (suggested_load_kg >= 0),
  suggested_reason text,
  suggested_at timestamptz
);
create index if not exists strength_exercises_template_idx on strength_exercises(template_id);

create table if not exists strength_set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  -- Kept even when the template row is edited or deleted later: the log is
  -- the record of what happened, not a pointer into a moving target.
  exercise_id uuid references strength_exercises(id) on delete set null,
  exercise_name text not null,
  set_number int not null check (set_number between 1 and 12),
  reps int check (reps >= 0),
  load_kg numeric check (load_kg >= 0),
  logged_at timestamptz not null default now()
);
create unique index if not exists strength_set_logs_uidx
  on strength_set_logs(session_id, exercise_name, set_number);
create index if not exists strength_set_logs_exercise_idx on strength_set_logs(exercise_id);

-- ── RLS: everything belongs to one athlete ─────────────────────────────────
alter table strength_templates enable row level security;
alter table strength_exercises enable row level security;
alter table strength_set_logs enable row level security;

drop policy if exists strength_templates_all on strength_templates;
create policy strength_templates_all on strength_templates for all
  using (owns_profile(profile_id)) with check (owns_profile(profile_id));

drop policy if exists strength_exercises_all on strength_exercises;
create policy strength_exercises_all on strength_exercises for all using (
  exists (select 1 from strength_templates t where t.id = template_id and owns_profile(t.profile_id))
) with check (
  exists (select 1 from strength_templates t where t.id = template_id and owns_profile(t.profile_id))
);

drop policy if exists strength_set_logs_all on strength_set_logs;
create policy strength_set_logs_all on strength_set_logs for all using (
  exists (select 1 from sessions s where s.id = session_id and owns_plan(s.plan_id))
) with check (
  exists (select 1 from sessions s where s.id = session_id and owns_plan(s.plan_id))
);

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0016_long_run.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- The long run.
--
-- Running is 50-60% of a Hyrox and the Zone-2 long run is the session that
-- carries it — 60-90 minutes at conversational pace, for mitochondrial density
-- and tendon economy. The plan had no session type for it: "run_easy" covered
-- recovery running and nothing covered the long one.
--
-- Note for an EXISTING database: this adds the enum value. A fresh install
-- gets it from 0001 (the create-type there lists it), which is what keeps
-- setup.sql runnable as a single transaction — a new enum value may not be
-- USED in the transaction that adds it. Nothing here uses it: the library
-- block below is tagged, not typed (see src/lib/engine/fill.ts).
-- ============================================================================

alter type session_type_t add value if not exists 'long_run';

-- The long-run block. It stays a `run_easy` block by type and is picked for a
-- long run by its "long" tag, so this file never has to reference the new enum
-- value it just created.
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags)
values (
  'run_long_z2',
  'main',
  'run',
  '[{"exercise":"Continuous Zone-2 run — conversational the whole way, 60-90 s/km slower than 5k pace","rest_sec":0}]'::jsonb,
  'gym',
  1,
  '{run_easy}',
  '{aerobic,running,long}'
)
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0017_running_volume.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Running volume the athlete sets, instead of one the engine assumes.
--
--   weekly_km_peak   the highest weekly running volume of the cycle. Every
--                    other week is derived from it by the phase curve, so one
--                    number describes the whole build (a cycle average would
--                    hide exactly the week that decides whether it is doable).
--   runs_per_week    how many of the week's sessions are runs.
--
-- Both nullable: unset means the engine keeps deriving volume from the session
-- prescriptions in src/lib/engine/running.ts, which is what every existing
-- plan does today.
-- ============================================================================

alter table athlete_profiles
  add column if not exists weekly_km_peak numeric
    check (weekly_km_peak is null or weekly_km_peak between 15 and 150),
  add column if not exists runs_per_week int
    check (runs_per_week is null or runs_per_week between 2 and 6);

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0018_run_variants.sql
-- ─────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0019_station_variants.sql
-- ─────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────
-- supabase/migrations/0020_plyo_and_max_strength.sql
-- ─────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────
-- supabase/seed/0001_benchmark_definitions.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Benchmark protocol (Implementation Plan §2 Must-Have)
-- Start / Mid / Pre-Race testing — proves progress, feeds pace zones + prognosis.
-- ============================================================================
insert into benchmark_definitions (slug, name, metric_type, protocol) values
  ('run_1k',      '1 km Time Trial',      'time_sec',   'All-out 1 km run from standstill. Fuels running pace zones.'),
  ('row_1000',    '1000 m Row',           'time_sec',   'All-out 1000 m on a Concept2 rower, damper 5–6.'),
  ('ski_1000',    '1000 m SkiErg',        'time_sec',   'All-out 1000 m on the SkiErg.'),
  ('wall_balls',  'Max Wall Balls (2 min)','reps',      'Max wall balls in 2 minutes at division weight/target height.'),
  ('burpee_bj_4', 'Burpee Broad Jumps 40 m','time_sec', 'Time for 40 m of burpee broad jumps — hinge-station proxy.'),
  ('run_5k',      '5 km Time Trial',      'time_sec',   'Baseline aerobic test captured at onboarding; refreshes at mid.')
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────────────
-- supabase/seed/0002_workout_blocks.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- workout_blocks library (Implementation Plan §3 — own IP, §7 copyright note)
-- Every block is originally authored. Loads are ALWAYS explicit per division
-- (open/pro) — the literal App-Store cancellation reason (PP2).
-- difficulty_tier 1..3 is what the engine scales via athlete_state.station_tiers.
-- ============================================================================

-- ── WARM-UPS (general) ──────────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('wu_general_raise', 'warmup', 'general',
 '[{"exercise":"Row or bike easy","distance_m":500,"rest_sec":0},{"exercise":"Leg swings + world''s greatest stretch","reps":8,"rest_sec":0},{"exercise":"Air squats","reps":15,"rest_sec":0}]'::jsonb,
 'gym', 1, '{strength,station_work,run_intervals,compromised_run,full_sim,benchmark}', '{warmup,activation}'),
('wu_run_drills', 'warmup', 'run',
 '[{"exercise":"Easy jog","distance_m":800,"rest_sec":0},{"exercise":"A-skips / high knees","distance_m":20,"sets":3,"rest_sec":30},{"exercise":"Strides","distance_m":60,"sets":4,"rest_sec":60}]'::jsonb,
 'gym', 1, '{run_easy,run_intervals,compromised_run}', '{warmup,running}'),
('wu_home_mobility', 'warmup', 'general',
 '[{"exercise":"Jumping jacks","reps":40,"rest_sec":0},{"exercise":"Inchworm to push-up","reps":8,"rest_sec":0},{"exercise":"Reverse lunge + reach","reps":10,"rest_sec":0}]'::jsonb,
 'home', 1, '{strength,station_work}', '{warmup,home}')
on conflict (slug) do nothing;

-- ── RUN (easy / intervals) ──────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('run_easy_z2', 'main', 'run',
 '[{"exercise":"Zone-2 continuous run at easy pace zone","distance_m":6000,"rest_sec":0}]'::jsonb,
 'gym', 1, '{run_easy}', '{aerobic,running}'),
('run_intervals_400', 'main', 'run',
 '[{"exercise":"400 m at interval pace","sets":6,"distance_m":400,"rest_sec":90}]'::jsonb,
 'gym', 1, '{run_intervals}', '{vo2,running}'),
('run_intervals_800', 'main', 'run',
 '[{"exercise":"800 m at interval pace","sets":5,"distance_m":800,"rest_sec":120}]'::jsonb,
 'gym', 2, '{run_intervals}', '{threshold,running}'),
('run_intervals_1k', 'main', 'run',
 '[{"exercise":"1000 m at tempo pace","sets":5,"distance_m":1000,"rest_sec":150}]'::jsonb,
 'gym', 3, '{run_intervals}', '{threshold,running}')
on conflict (slug) do nothing;

-- ── COMPROMISED RUNNING (run + station under fatigue) ───────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('cr_run_wallball', 'main', 'general',
 '[{"exercise":"1000 m run at race pace","distance_m":1000,"sets":4,"rest_sec":0},{"exercise":"Wall balls immediately after each run","reps":25,"load_by_division":{"open":"6 kg","pro":"9 kg"},"sets":4,"rest_sec":120}]'::jsonb,
 'gym', 1, '{compromised_run}', '{compromised,hyrox}'),
('cr_run_sled', 'main', 'general',
 '[{"exercise":"800 m run at race pace","distance_m":800,"sets":4,"rest_sec":0},{"exercise":"Sled push 15 m after each run","distance_m":15,"load_by_division":{"open":"125 kg total","pro":"175 kg total"},"sets":4,"rest_sec":150}]'::jsonb,
 'gym', 2, '{compromised_run}', '{compromised,hyrox,legs}'),
('cr_run_lunge', 'main', 'general',
 '[{"exercise":"1000 m run at race pace","distance_m":1000,"sets":3,"rest_sec":0},{"exercise":"Sandbag walking lunges 25 m","distance_m":25,"load_by_division":{"open":"20 kg","pro":"30 kg"},"sets":3,"rest_sec":120}]'::jsonb,
 'gym', 3, '{compromised_run}', '{compromised,hyrox,legs}')
on conflict (slug) do nothing;

-- ── STATION WORK (per-station, tiered) ──────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('st_ski_intervals', 'main', 'ski_erg',
 '[{"exercise":"SkiErg intervals","distance_m":250,"sets":6,"rest_sec":60}]'::jsonb,
 'gym', 1, '{station_work}', '{ski,upper}'),
('st_ski_race', 'main', 'ski_erg',
 '[{"exercise":"SkiErg race-pace holds","distance_m":500,"sets":4,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work}', '{ski,upper}'),
('st_row_intervals', 'main', 'row',
 '[{"exercise":"Row intervals","distance_m":250,"sets":6,"rest_sec":60}]'::jsonb,
 'gym', 1, '{station_work}', '{row,pull}'),
('st_row_race', 'main', 'row',
 '[{"exercise":"Row race-pace holds","distance_m":500,"sets":4,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work}', '{row,pull}'),
('st_sled_push', 'main', 'sled_push',
 '[{"exercise":"Sled push","distance_m":12.5,"load_by_division":{"open":"125 kg total","pro":"175 kg total"},"sets":6,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work,strength}', '{sled,legs}'),
('st_sled_pull', 'main', 'sled_pull',
 '[{"exercise":"Sled pull (rope, hand-over-hand)","distance_m":12.5,"load_by_division":{"open":"78 kg total","pro":"128 kg total"},"sets":6,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work,strength}', '{sled,pull}'),
('st_burpee_bj', 'main', 'burpee_broad_jump',
 '[{"exercise":"Burpee broad jumps","distance_m":20,"sets":4,"rest_sec":75}]'::jsonb,
 'gym', 1, '{station_work}', '{burpee,engine}'),
('st_farmers', 'main', 'farmers_carry',
 '[{"exercise":"Farmers carry","distance_m":100,"load_by_division":{"open":"2x24 kg","pro":"2x32 kg"},"sets":4,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work,strength}', '{grip,carry}'),
('st_lunges', 'main', 'sandbag_lunges',
 '[{"exercise":"Sandbag walking lunges","distance_m":50,"load_by_division":{"open":"20 kg","pro":"30 kg"},"sets":4,"rest_sec":90}]'::jsonb,
 'gym', 2, '{station_work,strength}', '{legs,lunges}'),
('st_wallballs', 'main', 'wall_balls',
 '[{"exercise":"Wall balls (unbroken sets)","reps":25,"load_by_division":{"open":"6 kg / 3.0 m target","pro":"9 kg / 3.0 m target"},"sets":4,"rest_sec":75}]'::jsonb,
 'gym', 1, '{station_work}', '{wallball,legs}')
on conflict (slug) do nothing;

-- ── STRENGTH ────────────────────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('str_lower_squat', 'main', 'general',
 '[{"exercise":"Back squat","sets":4,"reps":6,"load_by_division":{"open":"70% 1RM","pro":"78% 1RM"},"rest_sec":150},{"exercise":"Romanian deadlift","sets":3,"reps":8,"load_by_division":{"open":"moderate","pro":"heavy"},"rest_sec":120}]'::jsonb,
 'gym', 2, '{strength}', '{lower,strength}'),
('str_push_pull', 'main', 'general',
 '[{"exercise":"Push press","sets":4,"reps":6,"load_by_division":{"open":"moderate","pro":"heavy"},"rest_sec":120},{"exercise":"Pull-ups","sets":4,"reps":8,"rest_sec":90}]'::jsonb,
 'gym', 2, '{strength}', '{upper,strength}'),
('str_posterior', 'main', 'general',
 '[{"exercise":"Deadlift","sets":5,"reps":5,"load_by_division":{"open":"75% 1RM","pro":"82% 1RM"},"rest_sec":180},{"exercise":"Weighted step-ups","sets":3,"reps":10,"load_by_division":{"open":"2x16 kg","pro":"2x24 kg"},"rest_sec":90}]'::jsonb,
 'gym', 3, '{strength}', '{lower,strength}'),
('str_home_unilateral', 'main', 'general',
 '[{"exercise":"Bulgarian split squat","sets":4,"reps":12,"load_by_division":{"open":"2x12 kg","pro":"2x20 kg"},"rest_sec":90},{"exercise":"Backpack RDL","sets":3,"reps":12,"rest_sec":60},{"exercise":"Push-ups","sets":3,"reps":20,"rest_sec":60}]'::jsonb,
 'home', 1, '{strength}', '{home,lower}')
on conflict (slug) do nothing;

-- ── FULL SIMULATION (Peak) ──────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('sim_half_hyrox', 'main', 'general',
 '[{"exercise":"4 rounds: 1000 m run + one station","distance_m":1000,"sets":4,"rest_sec":0,"load_by_division":{"open":"station @ open weights","pro":"station @ pro weights"}}]'::jsonb,
 'gym', 2, '{full_sim}', '{simulation,hyrox}'),
('sim_full_hyrox', 'main', 'general',
 '[{"exercise":"Full Hyrox simulation: 8x(1000 m run + station in order)","distance_m":8000,"sets":1,"rest_sec":0,"load_by_division":{"open":"all stations @ open weights","pro":"all stations @ pro weights"}}]'::jsonb,
 'gym', 3, '{full_sim,benchmark}', '{simulation,hyrox,race}')
on conflict (slug) do nothing;

-- ── FINISHERS ───────────────────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('fin_core', 'finisher', 'general',
 '[{"exercise":"Plank","reps":45,"sets":3,"rest_sec":30},{"exercise":"Hollow hold","reps":30,"sets":3,"rest_sec":30}]'::jsonb,
 'gym', 1, '{strength,station_work}', '{core,finisher}'),
('fin_grip', 'finisher', 'farmers_carry',
 '[{"exercise":"Dead hang","reps":40,"sets":3,"rest_sec":45},{"exercise":"Farmers hold","reps":40,"load_by_division":{"open":"2x24 kg","pro":"2x32 kg"},"sets":3,"rest_sec":60}]'::jsonb,
 'gym', 1, '{strength,station_work}', '{grip,finisher}')
on conflict (slug) do nothing;

-- ── MOBILITY / RECOVERY ─────────────────────────────────────────────────────
insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('mob_lower', 'mobility', 'general',
 '[{"exercise":"Couch stretch","reps":60,"sets":2,"rest_sec":0},{"exercise":"90/90 hip switches","reps":10,"sets":2,"rest_sec":0},{"exercise":"Ankle rocks","reps":12,"sets":2,"rest_sec":0}]'::jsonb,
 'gym', 1, '{mobility,strength,station_work,compromised_run,run_intervals,full_sim}', '{mobility,recovery}'),
('mob_full', 'mobility', 'general',
 '[{"exercise":"Thoracic openers","reps":10,"sets":2,"rest_sec":0},{"exercise":"Pigeon stretch","reps":45,"sets":2,"rest_sec":0},{"exercise":"Downward dog to cobra flow","reps":8,"sets":2,"rest_sec":0}]'::jsonb,
 'gym', 1, '{mobility}', '{mobility,recovery}'),
('mob_lowimpact', 'main', 'general',
 '[{"exercise":"Easy bike or swim","planned_duration_min":30,"rest_sec":0},{"exercise":"Full-body mobility flow","reps":10,"sets":3,"rest_sec":0}]'::jsonb,
 'gym', 1, '{mobility,rest}', '{rehab,lowimpact}')
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────────────
-- supabase/seed/0003_workout_blocks_home.sql
-- ─────────────────────────────────────────────────────────────────────
-- ============================================================================
-- Home / minimal-equipment library (Phase C5, §2 Should-Have).
-- Originally authored alternatives per station so home_minimal athletes get
-- purpose-built blocks instead of the gym fallback. Loads assume dumbbells or
-- a loaded backpack — always explicit (PP2).
-- ============================================================================

insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values
('st_home_ski', 'main', 'ski_erg',
 '[{"exercise":"Band lat pull-downs (anchored high)","reps":20,"sets":5,"rest_sec":45},{"exercise":"Burpees","reps":10,"sets":5,"rest_sec":45}]'::jsonb,
 'home', 1, '{station_work}', '{home,ski,upper}'),
('st_home_row', 'main', 'row',
 '[{"exercise":"Bent-over rows","reps":15,"load_by_division":{"open":"2x12 kg","pro":"2x20 kg"},"sets":5,"rest_sec":60},{"exercise":"Jump squats","reps":12,"sets":5,"rest_sec":45}]'::jsonb,
 'home', 1, '{station_work}', '{home,row,pull}'),
('st_home_sled_push', 'main', 'sled_push',
 '[{"exercise":"Bear crawl","distance_m":15,"sets":6,"rest_sec":60},{"exercise":"Loaded step-ups (backpack)","reps":12,"load_by_division":{"open":"15 kg","pro":"25 kg"},"sets":4,"rest_sec":75}]'::jsonb,
 'home', 1, '{station_work,strength}', '{home,sled,legs}'),
('st_home_sled_pull', 'main', 'sled_pull',
 '[{"exercise":"Towel rows (partner/anchor) or heavy band pulls","reps":15,"sets":5,"rest_sec":60},{"exercise":"Reverse lunges","reps":16,"load_by_division":{"open":"2x10 kg","pro":"2x16 kg"},"sets":4,"rest_sec":60}]'::jsonb,
 'home', 1, '{station_work,strength}', '{home,sled,pull}'),
('st_home_wallballs', 'main', 'wall_balls',
 '[{"exercise":"Dumbbell thrusters","reps":20,"load_by_division":{"open":"2x7,5 kg","pro":"2x10 kg"},"sets":4,"rest_sec":75}]'::jsonb,
 'home', 1, '{station_work}', '{home,wallball,legs}'),
('st_home_farmers', 'main', 'farmers_carry',
 '[{"exercise":"Farmers carry (dumbbells or canisters)","distance_m":80,"load_by_division":{"open":"2x16 kg","pro":"2x24 kg"},"sets":4,"rest_sec":90},{"exercise":"Dead hang or towel hang","reps":40,"sets":3,"rest_sec":60}]'::jsonb,
 'home', 1, '{station_work,strength}', '{home,grip,carry}'),
('st_home_lunges', 'main', 'sandbag_lunges',
 '[{"exercise":"Walking lunges (loaded backpack)","distance_m":40,"load_by_division":{"open":"15 kg","pro":"25 kg"},"sets":4,"rest_sec":90}]'::jsonb,
 'home', 1, '{station_work,strength}', '{home,legs,lunges}'),
('cr_home_run_lunge', 'main', 'general',
 '[{"exercise":"1000 m run at race pace","distance_m":1000,"sets":3,"rest_sec":0},{"exercise":"Backpack walking lunges 25 m after each run","distance_m":25,"load_by_division":{"open":"15 kg","pro":"25 kg"},"sets":3,"rest_sec":120}]'::jsonb,
 'home', 1, '{compromised_run}', '{home,compromised}'),
('cr_home_run_thruster', 'main', 'general',
 '[{"exercise":"800 m run at race pace","distance_m":800,"sets":4,"rest_sec":0},{"exercise":"Dumbbell thrusters after each run","reps":15,"load_by_division":{"open":"2x7,5 kg","pro":"2x10 kg"},"sets":4,"rest_sec":120}]'::jsonb,
 'home', 2, '{compromised_run}', '{home,compromised}'),
('sim_home_hyrox', 'main', 'general',
 '[{"exercise":"4 rounds: 1000 m run + home station circuit (thrusters, lunges, rows, burpees)","distance_m":1000,"sets":4,"rest_sec":0,"load_by_division":{"open":"dumbbells 2x7,5 kg / backpack 15 kg","pro":"2x10 kg / 25 kg"}}]'::jsonb,
 'home', 2, '{full_sim}', '{home,simulation}')
on conflict (slug) do nothing;
-- ============================================================================
-- 0021 — race days in the training plan.
--
-- The season layer (0012) already stores the athlete's race calendar and marks
-- which races anchor a macrocycle. What was missing is the other half: the
-- weekly plan never knew about any race except the one it was generated for,
-- so a B or C race in the calendar changed exactly nothing in the training
-- days around it.
--
-- src/lib/engine/raceCalendar.ts now resolves the calendar onto the plan grid
-- and writes a real session on the race day. That needs a session type of its
-- own — a race is neither a simulation nor a benchmark.
--
-- Note for an EXISTING database: this adds the enum value. A fresh install
-- gets it from 0001 (the create-type there lists it), which is what keeps
-- setup.sql runnable as a single transaction — a new enum value may not be
-- USED in the transaction that adds it. Nothing here uses it: a race day
-- carries no workout_blocks at all (fill.ts returns no blocks for it), so no
-- library row has to reference the value this file just created.
-- ============================================================================

alter type session_type_t add value if not exists 'race_day';
-- ============================================================================
-- 0022 — moving a session, including the swap.
--
-- The move endpoint existed since the first release but had no control in the
-- UI, and two things stood in the way of giving it one:
--
--   1. One AM and one PM per day is a unique index, so in a five- or six-day
--      week almost every target is already occupied. "That slot is taken" is a
--      dead end, not an answer: what an athlete actually wants is to TRADE two
--      days. A swap needs both rows to change at once, which a non-deferrable
--      unique index forbids — so the index becomes a DEFERRABLE constraint and
--      the function defers it for the length of its own transaction.
--   2. The endpoint set status = 'moved' unconditionally, which quietly threw
--      away a 'done' or 'skipped' log. Only a still-planned session changes
--      status now.
--
-- Ownership is checked explicitly against auth.uid(), because a security
-- definer function bypasses the RLS policy that normally does it.
-- ============================================================================

-- A unique *index* cannot be deferred; a unique *constraint* can. Same columns,
-- same invariant — one AM and one PM per day, never more.
drop index if exists sessions_week_day_slot_uidx;

do $$ begin
  alter table sessions
    add constraint sessions_week_day_slot_uniq unique (week_id, day_hint, day_slot)
    deferrable initially immediate;
exception when duplicate_table or duplicate_object then null; end $$;

create or replace function move_session(p_session uuid, p_day int, p_slot day_slot_t)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v sessions%rowtype;
  v_other sessions%rowtype;
begin
  if p_day < 1 or p_day > 7 then
    raise exception 'invalid_day';
  end if;

  select * into v from sessions where id = p_session;
  if not found then
    raise exception 'not_found';
  end if;

  if not exists (
    select 1
    from plans p
    join athlete_profiles ap on ap.id = p.profile_id
    where p.id = v.plan_id and ap.user_id = auth.uid()
  ) then
    raise exception 'not_authorized';
  end if;

  if v.day_hint = p_day and v.day_slot = p_slot then
    return jsonb_build_object('moved', false, 'swapped_with', null);
  end if;

  select * into v_other
  from sessions
  where week_id = v.week_id and day_hint = p_day and day_slot = p_slot;

  -- Both rows move in the same transaction; without the deferral the first
  -- update would collide with the row the second one is about to vacate.
  set constraints sessions_week_day_slot_uniq deferred;

  if found then
    update sessions
    set day_hint = v.day_hint,
        day_slot = v.day_slot,
        status = case when status = 'planned' then 'moved' else status end
    where id = v_other.id;
  end if;

  update sessions
  set day_hint = p_day,
      day_slot = p_slot,
      status = case when status = 'planned' then 'moved' else status end
  where id = v.id;

  return jsonb_build_object(
    'moved', true,
    'from_day', v.day_hint,
    'from_slot', v.day_slot,
    'swapped_with', case when v_other.id is null then null else to_jsonb(v_other.title) end
  );
end;
$$;

revoke all on function move_session(uuid, int, day_slot_t) from public;
grant execute on function move_session(uuid, int, day_slot_t) to authenticated;
-- ============================================================================
-- 0023 — five experience levels instead of three.
--
-- The coaching reference splits athletes by target time, and the training
-- frequency table needs the top of the field: an Elite athlete (sub-70)
-- trains 6-8 sessions over 5-6 days with occasional doubles, a World-Class
-- athlete (sub-60) 7-9 sessions over 6 days with AM/PM as the norm — neither
-- fits into "advanced".
--
-- Note for an EXISTING database: this adds the enum values. A fresh install
-- gets them from 0001 (the create-type there lists them), which is what keeps
-- setup.sql runnable as a single transaction — a new enum value may not be
-- USED in the transaction that adds it. Nothing here uses them: the frequency
-- table and station tiers live in application code.
-- ============================================================================

alter type experience_level_t add value if not exists 'elite';
alter type experience_level_t add value if not exists 'world_class';
