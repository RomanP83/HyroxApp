-- Log, strength sets and status commit together; duplicate deliveries are no-ops.
create or replace function record_session_completion(
  p_session uuid,
  p_completed_as_planned boolean,
  p_rpe int,
  p_duration int,
  p_block_results jsonb,
  p_notes text,
  p_strength_sets jsonb default '[]'::jsonb,
  p_completed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log uuid;
  v_profile uuid;
  v_sets int := 0;
begin
  if p_rpe is null or p_rpe not between 1 and 10 or p_duration is null or p_duration <= 0 then
    raise exception 'invalid_session_values';
  end if;
  select p.profile_id into v_profile
  from sessions s join plans p on p.id = s.plan_id
  join athlete_profiles ap on ap.id = p.profile_id
  where s.id = p_session and (ap.user_id = auth.uid() or auth.role() = 'service_role')
  for update of s;
  if not found then raise exception 'not_authorized'; end if;

  if jsonb_typeof(coalesce(p_strength_sets, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_strength_sets, '[]'::jsonb)) > 60 then
    raise exception 'invalid_strength_sets';
  end if;
  -- SECURITY DEFINER must also validate the referenced exercise owner.
  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_strength_sets, '[]'::jsonb)) as x(exercise_id uuid)
    where x.exercise_id is not null and not exists (
      select 1 from strength_exercises e join strength_templates t on t.id = e.template_id
      where e.id = x.exercise_id and t.profile_id = v_profile
    )
  ) then raise exception 'exercise_not_owned'; end if;

  insert into session_logs(
    session_id, completed_as_planned, rpe_actual, duration_actual_min,
    block_results, notes, completed_at
  ) values (
    p_session, p_completed_as_planned, p_rpe, p_duration,
    p_block_results, p_notes, coalesce(p_completed_at, now())
  )
  on conflict (session_id) do nothing returning id into v_log;
  if v_log is null then return jsonb_build_object('created', false, 'strength_sets', 0); end if;

  insert into strength_set_logs(
    session_id, exercise_id, exercise_name, set_number, reps, load_kg, logged_at
  )
  select p_session, x.exercise_id, trim(x.exercise_name), x.set_number,
    x.reps, x.load_kg, coalesce(p_completed_at, now())
  from jsonb_to_recordset(coalesce(p_strength_sets, '[]'::jsonb)) as x(
    exercise_id uuid, exercise_name text, set_number int, reps int, load_kg numeric
  )
  where trim(coalesce(x.exercise_name, '')) <> '' and (x.reps is not null or x.load_kg is not null);
  get diagnostics v_sets = row_count;

  update sessions set status = 'done' where id = p_session;
  return jsonb_build_object('created', true, 'strength_sets', v_sets);
end;
$$;
revoke all on function record_session_completion(uuid, boolean, int, int, jsonb, text, jsonb, timestamptz)
  from public, anon;
grant execute on function record_session_completion(uuid, boolean, int, int, jsonb, text, jsonb, timestamptz)
  to authenticated, service_role;
