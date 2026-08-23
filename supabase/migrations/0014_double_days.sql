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
