-- ============================================================================
-- 0025 — manual moves survive a rebase.
--
-- Moving a session wrote the new day straight onto the row, and a rebase
-- regenerates every remaining week from scratch: change your running volume
-- after arranging a week by hand and the arrangement was gone. The move was
-- audited in plan_adjustments, but that row keys on the OLD plan's session id,
-- which no longer exists after the rebase — nothing could replay it.
--
-- An override is therefore stored against the CALENDAR week, not the plan:
-- plan week numbering shifts when a plan is rebuilt from today, but the Monday
-- a week starts on does not. Plan week W of a plan generated on G starts at
-- monday(G) + (W-1)*7 — that is the anchor generation already uses for the
-- race calendar (raceCalendar.ts).
--
-- Keyed by session type: "the compromised run of that week moved to Thursday".
-- A swap writes two rows, one per type, which is exactly what a swap is. A
-- week holding two sessions of the same type applies the override to the
-- first — rare, and better than guessing.
-- ============================================================================

create table if not exists session_day_overrides (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  -- Monday of the calendar week this override belongs to.
  week_start date not null,
  session_type session_type_t not null,
  day_hint int not null check (day_hint between 1 and 7),
  day_slot day_slot_t not null default 'am',
  created_at timestamptz not null default now(),
  unique (profile_id, week_start, session_type)
);
create index if not exists session_day_overrides_profile_idx
  on session_day_overrides(profile_id, week_start);

alter table session_day_overrides enable row level security;

drop policy if exists sdo_all on session_day_overrides;
create policy sdo_all on session_day_overrides for all
  using (owns_profile(profile_id))
  with check (owns_profile(profile_id));
