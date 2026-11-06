-- ============================================================================
-- 0030 — engine-rendered blocks persist, the Verona workout collection, and
-- the import from the single-file HyroxTraining tracker.
--
-- 1. persist_plan cast every block_id to uuid. The level-specific compromised
--    sessions (compromisedSessions.ts) are rendered by the engine and carry
--    their slug as block_id, so any plan containing one failed to save. The
--    workout collection below renders the same way. resolve_plan_block()
--    passes a library uuid through and stores an engine-rendered block as a
--    workout_blocks row keyed by its slug (tag 'inline', no session_types, so
--    the generic block picker never selects it). Readers are unchanged: the
--    content comes back through the usual session_blocks → workout_blocks join.
--
-- 2. athlete_profiles.workout_collection: 'standard' (the library) or
--    'verona' (the sessions of the Verona plan, veronaWorkouts.ts). With
--    'verona' the pickers take the collection's session for that slot and
--    phase whenever it has one, and fall back to the library otherwise.
--
-- 3. Import: imported_workouts holds finished sessions from the old tracker
--    as history. Simulations become athlete_race_results, station records become
--    benchmark_results; both get (source, source_id) so a re-import adds only
--    what is new. Eight full-distance station benchmarks join the list.
-- ============================================================================

-- Guard: a table of the same name from another app must not be altered.
-- If one exists without this migration's columns, stop before changing anything.
do $$
begin
  if to_regclass('public.imported_workouts') is not null and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'imported_workouts' and column_name = 'done_on'
  ) then
    raise exception 'Table public.imported_workouts already exists with a different structure (no column done_on). It is not HyroxApp''s — rename or remove it, or run HyroxApp in its own Supabase project.';
  end if;
end $$;

create or replace function resolve_plan_block(b jsonb, p_session_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw text := b->>'block_id';
  v_slug text;
  v_id uuid;
begin
  if v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v_raw::uuid;
  end if;
  v_slug := coalesce(nullif(b->>'slug', ''), v_raw);
  if v_slug is null then
    raise exception 'block_without_id_or_slug';
  end if;

  -- An inline row follows the engine's current content; a real library row
  -- with the same slug is never overwritten.
  insert into workout_blocks (slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags)
  values (
    v_slug,
    coalesce(nullif(b->>'block_type', ''), 'main')::block_type_t,
    nullif(b->>'station', '')::station_t,
    coalesce(b->'content', '[]'::jsonb),
    'gym',
    2,
    '{}',
    array['inline', coalesce(p_session_type, '')]
  )
  on conflict (slug) do update
    set content = excluded.content,
        block_type = excluded.block_type,
        station = excluded.station
    where 'inline' = any(workout_blocks.tags);

  select id into v_id from workout_blocks where slug = v_slug;
  return v_id;
end;
$$;

revoke all on function resolve_plan_block(jsonb, text) from public;
grant execute on function resolve_plan_block(jsonb, text) to authenticated, service_role;

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

        -- resolve_plan_block: a library uuid passes through; an engine-rendered
        -- block (compromised session, workout collection) is stored by slug.
        insert into session_blocks (session_id, block_id, sort_order, load_adjustments)
        select
          v_session,
          resolve_plan_block(b, sess->>'session_type'),
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

alter table athlete_profiles
  add column if not exists workout_collection text not null default 'standard'
  check (workout_collection in ('standard', 'verona'));

-- ── import bookkeeping ─────────────────────────────────────────────────────
alter table athlete_race_results add column if not exists source text;
alter table athlete_race_results add column if not exists source_id text;
create unique index if not exists athlete_race_results_source_uidx
  on athlete_race_results(profile_id, source, source_id);

alter table benchmark_results add column if not exists source text;
alter table benchmark_results add column if not exists source_id text;
create unique index if not exists benchmark_results_source_uidx
  on benchmark_results(profile_id, source, source_id);

create table if not exists imported_workouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  source text not null,
  source_id text not null,
  done_on date not null,
  kind text not null check (char_length(kind) <= 40),
  title text check (char_length(title) <= 200),
  duration_min int check (duration_min between 0 and 600),
  rpe numeric check (rpe between 0 and 10),
  distance_km numeric check (distance_km between 0 and 200),
  notes text check (char_length(notes) <= 2000),
  imported_at timestamptz not null default now(),
  unique (profile_id, source, source_id)
);
create index if not exists imported_workouts_profile_idx on imported_workouts(profile_id, done_on);

alter table imported_workouts enable row level security;

drop policy if exists iw_all on imported_workouts;
create policy iw_all on imported_workouts for all
  using (owns_profile(profile_id))
  with check (owns_profile(profile_id));

-- ── full-distance station benchmarks ───────────────────────────────────────
insert into benchmark_definitions (slug, name, metric_type, protocol) values
  ('station_ski_1000',     'SkiErg 1000 m',            'time_sec', 'Race distance, fresh or after a warm-up. Same erg and damper every time.'),
  ('station_push_50',      'Sled Push 50 m',           'time_sec', 'Race distance at race weight. Note the surface — carpet and rubber are not the same test.'),
  ('station_pull_50',      'Sled Pull 50 m',           'time_sec', 'Race distance at race weight, staying behind the line like in the race.'),
  ('station_bbj_80',       'Burpee Broad Jumps 80 m',  'time_sec', 'Race distance, unbroken if you can.'),
  ('station_row_1000',     'Row 1000 m',               'time_sec', 'Race distance. Same rower and damper every time.'),
  ('station_farmers_200',  'Farmers Carry 200 m',      'time_sec', 'Race distance at race weight.'),
  ('station_lunges_100',   'Sandbag Lunges 100 m',     'time_sec', 'Race distance at race weight.'),
  ('station_wallballs_100','Wall Balls 100 reps',      'time_sec', 'All hundred reps for time, after a run or a station block — the race never gives you fresh legs for them.')
on conflict (slug) do nothing;
