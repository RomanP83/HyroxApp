-- ============================================================================
-- 0033 — the training branch that ran beside main (late August), brought in.
--
-- These columns came with that work. A database that already ran its
-- migrations has them; "if not exists" keeps this harmless there.
--
--   athlete_profiles.preferred_double_days   the athlete pins the PM days
--   plans.starts_on                           the Monday week 1 begins on
--   plans.kind                                race cycle or transition block
--   athlete_state.measured_station_seconds    station splits from the last race
--   athlete_profiles.station_substitutions    standing swaps when a station is busy
--
-- Goal time: that work stored it as athlete_profiles.goal_race_time_sec; main
-- calls it target_time_sec (0029). One goal, one column: a value from the old
-- column is copied over where target_time_sec is still empty, and nothing
-- reads goal_race_time_sec any more. The old column is left in place.
--
-- Race results: that work had its own race_results table. Race results now
-- live in athlete_race_results (0029); race_results is left untouched.
--
-- resolve_plan_block() learns the branch's pinned catalogue ids: a uuid that
-- names an existing block passes through; one that does not (the catalogue
-- seed has not run yet) is stored by slug under that id. persist_plan gains
-- starts_on and kind.
-- ============================================================================

alter table athlete_profiles
  add column if not exists preferred_double_days int[] not null default '{}';

alter table plans add column if not exists starts_on date;
update plans
set starts_on = ((generated_at at time zone 'UTC')::date
  - ((extract(isodow from (generated_at at time zone 'UTC'))::int - 1) || ' days')::interval)::date
where starts_on is null;
alter table plans
  alter column starts_on set not null,
  alter column starts_on set default (
    current_date - ((extract(isodow from current_date)::int - 1) || ' days')::interval
  )::date;

alter table plans
  add column if not exists kind text not null default 'race';
do $$ begin
  alter table plans add constraint plans_kind_check check (kind in ('race', 'transition'));
exception when duplicate_object then null; end $$;

alter table athlete_state
  add column if not exists measured_station_seconds jsonb not null default '{}'::jsonb;

alter table athlete_profiles
  add column if not exists station_substitutions jsonb not null default '{}'::jsonb;

-- One goal time.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'athlete_profiles' and column_name = 'goal_race_time_sec'
  ) then
    execute 'update athlete_profiles set target_time_sec = goal_race_time_sec
             where target_time_sec is null and goal_race_time_sec between 2400 and 14400';
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
  v_is_uuid boolean := coalesce(v_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
  v_slug text;
  v_id uuid;
begin
  if v_is_uuid then
    select id into v_id from workout_blocks where id = v_raw::uuid;
    if found then return v_id; end if;
  end if;
  v_slug := coalesce(nullif(b->>'slug', ''), case when v_is_uuid then null else v_raw end);
  if v_slug is null then
    raise exception 'block_without_id_or_slug';
  end if;

  -- An inline row follows the engine's current content; a real library row
  -- with the same slug is never overwritten.
  insert into workout_blocks (id, slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags)
  values (
    case when v_is_uuid then v_raw::uuid else gen_random_uuid() end,
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

  insert into plans (profile_id, race_id, race_date, starts_on, kind, status, total_weeks, engine_version, stripe_payment_id)
  values (
    v_profile,
    nullif(p->>'race_id', '')::uuid,
    (p->>'race_date')::date,
    -- The Monday the plan's week 1 begins on. Sent by the caller so the
    -- athlete can start next Monday rather than mid-week; absent, the current
    -- week's Monday, which is what generated_at used to imply.
    coalesce(
      nullif(p->>'starts_on', '')::date,
      (current_date - ((extract(isodow from current_date)::int - 1) || ' days')::interval)::date
    ),
    coalesce(nullif(p->>'kind', ''), 'race'),
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
