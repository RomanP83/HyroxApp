-- ============================================================================
-- 0026 — move_session also reports WHAT it swapped with.
--
-- A swap moves two sessions, and 0025 stores manual moves keyed by session
-- type so a rebase can replay them. The function returned only the other
-- session's title, which is a display string — the second half of a swap could
-- not be recorded, so a rebase would put one side back and leave the other.
-- ============================================================================

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
    'swapped_with', case when v_other.id is null then null else to_jsonb(v_other.title) end,
    -- The type as well as the title: a swap is two decisions to remember, and
    -- session_day_overrides is keyed by type, not by a display string.
    'swapped_with_type', case when v_other.id is null then null else to_jsonb(v_other.session_type) end
  );
end;
$$;

