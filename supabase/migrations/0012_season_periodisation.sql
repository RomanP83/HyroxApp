-- ============================================================================
-- Season layer: the annual periodisation above the 4-20 week plan.
--
--   seasons 1:n season_races   (the calendar the athlete gives us)
--   seasons 1:n season_blocks  (the macro/mesocycles the engine derives)
--
-- The blocks are computed by src/lib/engine/season.ts — deterministic, so a
-- season is always reproducible from (start_date, races, weaknesses). They are
-- stored anyway: the plan page, the coach text and later the weekly generator
-- all need to know which block a given week belongs to without recomputing.
-- ============================================================================

do $$ begin
  create type race_priority_t as enum ('A', 'B', 'C');
exception when duplicate_object then null; end $$;

do $$ begin
  create type season_block_kind_t as enum (
    'post_race_recovery', 'base', 'build', 'race_specific', 'bridge', 'taper', 'open_base'
  );
exception when duplicate_object then null; end $$;

-- The athlete's own list of weaknesses ("Sled Push", "Laktattoleranz") — the
-- season planner routes each one to the block that is the right place for it.
alter table athlete_profiles
  add column if not exists weaknesses text[] not null default '{}';

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references athlete_profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  total_weeks int not null,
  horizon_weeks int not null default 52,
  engine_version text not null default 'v1.2',
  -- Coach-facing notes about the decisions the planner had to make (PP1).
  notes jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now()
);
create index if not exists seasons_profile_idx on seasons(profile_id);

create table if not exists season_races (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  sort_order int not null default 0,
  race_date date not null,
  race_type text not null,
  priority race_priority_t not null default 'A',
  -- Season-global week the race falls in, and whether it anchors a macrocycle
  -- (an A race gets a real taper; a B/C race is a hard training day).
  week_number int not null,
  is_anchor boolean not null default false,
  race_id uuid references races(id) on delete set null,
  plan_id uuid references plans(id) on delete set null
);
create index if not exists season_races_season_idx on season_races(season_id);

create table if not exists season_blocks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  -- Macrocycle = one race cycle (or the open tail); blocks are its mesocycles.
  macrocycle_sort int not null default 0,
  macrocycle_label text not null default '',
  target_race_index int,
  sort_order int not null default 0,
  kind season_block_kind_t not null,
  start_week int not null,
  end_week int not null,
  weeks int not null,
  start_date date not null,
  end_date date not null,
  volume_multiplier numeric not null default 1.0,
  focus text not null default '',
  key_sessions text[] not null default '{}',
  weakness_targets text[] not null default '{}',
  deload_weeks int[] not null default '{}'
);
create index if not exists season_blocks_season_idx on season_blocks(season_id);

-- ── RLS: a season belongs to its athlete, like plans ────────────────────────
alter table seasons enable row level security;
alter table season_races enable row level security;
alter table season_blocks enable row level security;

drop policy if exists seasons_all on seasons;
create policy seasons_all on seasons for all
  using (owns_profile(profile_id)) with check (owns_profile(profile_id));

drop policy if exists season_races_all on season_races;
create policy season_races_all on season_races for all using (
  exists (select 1 from seasons s where s.id = season_id and owns_profile(s.profile_id))
) with check (
  exists (select 1 from seasons s where s.id = season_id and owns_profile(s.profile_id))
);

drop policy if exists season_blocks_all on season_blocks;
create policy season_blocks_all on season_blocks for all using (
  exists (select 1 from seasons s where s.id = season_id and owns_profile(s.profile_id))
) with check (
  exists (select 1 from seasons s where s.id = season_id and owns_profile(s.profile_id))
);
