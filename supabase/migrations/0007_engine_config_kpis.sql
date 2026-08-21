-- ============================================================================
-- Phase D2: engine tuning without deploys + beta KPIs (plan §5/§7)
--
-- engine_config: the calibration constants ("Startwerte aus der Literatur")
-- per engine_version. The server merges this over the compiled defaults, so
-- beta tuning is an UPDATE on this table instead of a code deploy — while the
-- engine itself stays deterministic (same config -> same behavior).
-- Writes go through the service role only; reads are public like the library.
-- ============================================================================

create table if not exists engine_config (
  engine_version text primary key,
  config jsonb not null default '{}'::jsonb,
  notes text,
  updated_at timestamptz not null default now()
);

alter table engine_config enable row level security;
drop policy if exists engine_config_read on engine_config;
create policy engine_config_read on engine_config for select using (true);

-- Seed the current version with the literature defaults (mirrors
-- DEFAULT_TUNING in src/lib/engine/constants.ts).
insert into engine_config (engine_version, config, notes) values (
  'v1.2',
  '{
    "rpe_delta_up_threshold": -2,
    "rpe_delta_down_threshold": 2,
    "pace_step_sec_km": 5,
    "pace_weekly_cap_pct": 0.03,
    "pace_ref_window_days": 7,
    "strength_step": 0.05,
    "strength_modifier_min": 0.8,
    "strength_modifier_max": 1.2,
    "acwr_soft": 1.3,
    "acwr_hard": 1.5,
    "acwr_low": 0.8,
    "acwr_soft_trim": 0.85,
    "rpe_high_14d": 8.5,
    "inactive_rebase_days": 7
  }'::jsonb,
  'Literature starting values — tune during beta with real logs (§7).'
) on conflict (engine_version) do nothing;

-- ============================================================================
-- Beta KPI view (§7): most important metric is the share of logs with REAL
-- RPE input — athletes who 1-tap everything get the macro-only experience.
-- security_invoker: normal users see only their own rows via RLS; the
-- service role (admin route) sees the global numbers.
-- ============================================================================
create or replace view beta_kpis
with (security_invoker = true) as
select
  count(*)::int as logs_total,
  count(*) filter (where not sl.completed_as_planned)::int as logs_with_real_rpe,
  round(
    100.0 * count(*) filter (where not sl.completed_as_planned) / greatest(count(*), 1),
    1
  ) as real_rpe_pct,
  count(distinct s.plan_id)::int as plans_with_logs
from session_logs sl
join sessions s on s.id = sl.session_id;
