-- ============================================================================
-- 0038 — MyHealthHub strength workouts and the session each one ticked off.
--
-- Written by POST /api/hub/strength (service role). Keyed by the hub's own
-- workout id, so a redelivered workout logs once, an edited one is undone and
-- logged again, and a deleted one is undone.
-- ============================================================================

create table if not exists hub_strength_links (
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  hub_workout_id text not null check (char_length(hub_workout_id) <= 100),
  session_id uuid references sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, hub_workout_id)
);
create index if not exists hub_strength_links_session_idx on hub_strength_links(session_id);

alter table hub_strength_links enable row level security;

drop policy if exists hub_strength_links_read on hub_strength_links;
create policy hub_strength_links_read on hub_strength_links for select
  using (profile_id in (select id from athlete_profiles where user_id = auth.uid()));
