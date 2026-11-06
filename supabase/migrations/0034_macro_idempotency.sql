-- One macro directive may change a given week once. The claim and the session
-- updates share this transaction, so cron retries cannot compound durations.

create table if not exists macro_directive_applications (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  week_id uuid not null references plan_weeks(id) on delete cascade,
  directive text not null check (directive in ('auto_deload', 'trim_week', 'ramp_up')),
  multiplier numeric not null check (multiplier > 0 and multiplier <= 1),
  applied_at timestamptz not null default now(),
  unique (plan_id, week_id, directive)
);

alter table macro_directive_applications enable row level security;

create or replace function apply_macro_scale(
  p_plan uuid,
  p_week uuid,
  p_directive text,
  p_multiplier numeric,
  p_mark_deload boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim uuid;
begin
  if p_directive not in ('auto_deload', 'trim_week', 'ramp_up') then
    raise exception 'invalid_directive';
  end if;
  if p_multiplier <= 0 or p_multiplier > 1 then
    raise exception 'invalid_multiplier';
  end if;
  if not exists (select 1 from plan_weeks where id = p_week and plan_id = p_plan) then
    raise exception 'week_not_in_plan';
  end if;

  insert into macro_directive_applications(plan_id, week_id, directive, multiplier)
  values (p_plan, p_week, p_directive, p_multiplier)
  on conflict (plan_id, week_id, directive) do nothing
  returning id into v_claim;

  if v_claim is null then return false; end if;

  update sessions
  set planned_duration_min = greatest(15, round(planned_duration_min * p_multiplier)::int)
  where week_id = p_week and status in ('planned', 'moved');

  if p_mark_deload then
    update plan_weeks set is_deload = true where id = p_week;
  end if;
  return true;
end;
$$;

revoke all on function apply_macro_scale(uuid, uuid, text, numeric, boolean) from public, anon, authenticated;
grant execute on function apply_macro_scale(uuid, uuid, text, numeric, boolean) to service_role;

-- Serialize a rebase of the same source plan and commit its audit atomically.
create or replace function rebase_plan_once(p_old uuid, p_payload jsonb, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_status text;
  v_new uuid;
begin
  select profile_id, status::text into v_profile, v_status from plans where id = p_old for update;
  if not found then raise exception 'plan_not_found'; end if;
  if (p_payload->>'profile_id')::uuid is distinct from v_profile then
    raise exception 'profile_mismatch';
  end if;
  select plan_id into v_new from plan_adjustments
  where action_taken->>'type' = 'rebase' and action_taken->>'from_plan' = p_old::text
  order by created_at desc limit 1;
  if v_new is not null then return v_new; end if;
  if v_status not in ('active', 'paused', 'rehab') then raise exception 'stale_plan'; end if;
  v_new := persist_plan(p_payload);
  insert into plan_adjustments(plan_id, layer, trigger, action_taken, reason)
  values (v_new, 'macro', 'pause', jsonb_build_object('type', 'rebase', 'from_plan', p_old), p_reason);
  return v_new;
end;
$$;
revoke all on function rebase_plan_once(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function rebase_plan_once(uuid, jsonb, text) to service_role;
