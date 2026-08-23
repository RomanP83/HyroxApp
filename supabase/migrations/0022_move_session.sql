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
