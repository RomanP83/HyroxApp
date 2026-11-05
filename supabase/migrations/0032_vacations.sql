-- ============================================================================
-- 0032 — vacations, entered ahead of time.
--
-- mode 'maintain': easy runs, one optional quality run, bodyweight — no
-- stations, sled or game days. mode 'off': nothing planned. The race date
-- stays fixed; the simulation and the benchmark weeks move out of the
-- vacation, and the week the athlete comes back in is a lighter re-entry
-- week (src/lib/engine/vacation.ts). Vacation days do not count towards the
-- nightly "days without a session" rebase.
-- ============================================================================

create table if not exists vacations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  mode text not null default 'maintain' check (mode in ('maintain', 'off')),
  note text check (char_length(note) <= 80),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (ends_on - starts_on <= 60)
);
create index if not exists vacations_profile_idx on vacations(profile_id, starts_on);

alter table vacations enable row level security;

drop policy if exists vac_all on vacations;
create policy vac_all on vacations for all
  using (owns_profile(profile_id))
  with check (owns_profile(profile_id));
