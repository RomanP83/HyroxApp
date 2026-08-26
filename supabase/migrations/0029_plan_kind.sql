-- ============================================================================
-- 0029 — a plan knows whether it is aimed at a race.
--
-- The transition block is stored exactly like a race cycle: persist_plan puts
-- the block's own last Monday in race_date because the column is NOT NULL, and
-- nothing else distinguishes the two. So the app counts a countdown down to
-- "Race day" on a date where no race happens, and when the block ends it says
-- "your race was on <that date>". It was not a race.
--
-- A plain text column with a check rather than an enum: there is no ordering
-- to preserve and no third value in sight, and it keeps this migration free of
-- the create-type-then-use dance every enum change in this schema needs.
-- ============================================================================

alter table plans
  add column if not exists kind text not null default 'race'
    check (kind in ('race', 'transition'));

comment on column plans.kind is
  'race = periodised towards race_date. transition = the block between goals; race_date holds the block''s own end and no race happens on it.';

-- persist_plan carries it through (replaces the 0028 definition).
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
