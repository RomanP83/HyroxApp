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
