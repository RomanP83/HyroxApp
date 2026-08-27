-- ============================================================================
-- 0030 — the race actually happened.
--
-- The app could build a whole cycle towards a race and then learn nothing from
-- it. There was no table for a result: the plan closed, and the calibration
-- carried on running off RPE answers and gym benchmarks.
--
-- Eight station times measured under race conditions are the best data this
-- app will ever get about an athlete. They set the station tiers (see
-- tiersFromRaceResult in raceModel.ts), which in turn steer the catalogues'
-- weakness bias and the finish-time estimate — so one entry improves three
-- things that never need to know a race result exists.
--
-- Entered by hand, on purpose. Scraping the official results is legally murky
-- and technically fragile; seventeen numbers is five minutes, once.
-- ============================================================================

create table if not exists race_results (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  -- The plan that led here, when there was one. Kept as a link, not a
  -- dependency: a result outlives the plan and stays if the plan is deleted.
  plan_id uuid references plans(id) on delete set null,
  race_date date not null,
  division division_t not null,
  name text,
  total_seconds int not null check (total_seconds > 0),
  -- Eight kilometre splits, in race order.
  run_splits int[] not null default '{}',
  -- { ski_erg: 270, sled_push: 180, ... } — seconds per station.
  station_times jsonb not null default '{}'::jsonb,
  -- Derivable from the three above, stored because the official result reports
  -- it and an athlete may want to correct what the arithmetic assumed.
  roxzone_seconds int,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists race_results_profile_idx
  on race_results(profile_id, race_date desc);

alter table race_results enable row level security;

do $$ begin
  create policy race_results_owner on race_results
    for all
    using (
      exists (
        select 1 from athlete_profiles ap
        where ap.id = race_results.profile_id and ap.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from athlete_profiles ap
        where ap.id = race_results.profile_id and ap.user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;
