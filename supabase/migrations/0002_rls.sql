-- ============================================================================
-- Row Level Security (Implementation Plan §3: "RLS überall, user-scoped;
-- Templates/Bibliothek read-only public")
-- ============================================================================
-- Ownership is anchored on athlete_profiles.user_id = auth.uid().
-- The service-role key (webhooks / engine) bypasses RLS entirely, so
-- athlete_state and plan_adjustments are written server-side.
-- ============================================================================

alter table athlete_profiles   enable row level security;
alter table athlete_state      enable row level security;
alter table plans              enable row level security;
alter table plan_phases        enable row level security;
alter table plan_weeks         enable row level security;
alter table sessions           enable row level security;
alter table session_blocks     enable row level security;
alter table session_logs       enable row level security;
alter table benchmark_results  enable row level security;
alter table plan_adjustments   enable row level security;
alter table races              enable row level security;
alter table workout_blocks     enable row level security;
alter table benchmark_definitions enable row level security;

-- Helper: does the current user own this profile id?
create or replace function owns_profile(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from athlete_profiles ap
    where ap.id = p and ap.user_id = auth.uid()
  );
$$;

-- Helper: does the current user own this plan id?
create or replace function owns_plan(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from plans pl
    join athlete_profiles ap on ap.id = pl.profile_id
    where pl.id = p and ap.user_id = auth.uid()
  );
$$;

-- ── athlete_profiles ────────────────────────────────────────────────────────
drop policy if exists ap_select on athlete_profiles;
create policy ap_select on athlete_profiles for select using (user_id = auth.uid());
drop policy if exists ap_insert on athlete_profiles;
create policy ap_insert on athlete_profiles for insert with check (user_id = auth.uid());
drop policy if exists ap_update on athlete_profiles;
create policy ap_update on athlete_profiles for update using (user_id = auth.uid());

-- ── athlete_state (read own; writes go through service role) ─────────────────
drop policy if exists as_select on athlete_state;
create policy as_select on athlete_state for select using (owns_profile(profile_id));

-- ── plans ───────────────────────────────────────────────────────────────────
drop policy if exists plans_select on plans;
create policy plans_select on plans for select using (owns_profile(profile_id));
drop policy if exists plans_cud on plans;
create policy plans_cud on plans for all using (owns_profile(profile_id)) with check (owns_profile(profile_id));

-- ── plan_phases / plan_weeks / sessions (scoped via plan) ───────────────────
drop policy if exists phases_all on plan_phases;
create policy phases_all on plan_phases for all using (owns_plan(plan_id)) with check (owns_plan(plan_id));
drop policy if exists weeks_all on plan_weeks;
create policy weeks_all on plan_weeks for all using (owns_plan(plan_id)) with check (owns_plan(plan_id));
drop policy if exists sessions_all on sessions;
create policy sessions_all on sessions for all using (owns_plan(plan_id)) with check (owns_plan(plan_id));

-- ── session_blocks (scoped via its session's plan) ──────────────────────────
drop policy if exists session_blocks_all on session_blocks;
create policy session_blocks_all on session_blocks for all using (
  exists (select 1 from sessions s where s.id = session_id and owns_plan(s.plan_id))
) with check (
  exists (select 1 from sessions s where s.id = session_id and owns_plan(s.plan_id))
);

-- ── session_logs (user logs their own sessions) ─────────────────────────────
drop policy if exists session_logs_all on session_logs;
create policy session_logs_all on session_logs for all using (
  exists (select 1 from sessions s where s.id = session_id and owns_plan(s.plan_id))
) with check (
  exists (select 1 from sessions s where s.id = session_id and owns_plan(s.plan_id))
);

-- ── benchmark_results ───────────────────────────────────────────────────────
drop policy if exists benchmark_results_all on benchmark_results;
create policy benchmark_results_all on benchmark_results for all using (owns_profile(profile_id)) with check (owns_profile(profile_id));

-- ── plan_adjustments (read own; writes go through service role) ─────────────
drop policy if exists plan_adjustments_select on plan_adjustments;
create policy plan_adjustments_select on plan_adjustments for select using (owns_plan(plan_id));

-- ── read-only public reference data ─────────────────────────────────────────
drop policy if exists races_read on races;
create policy races_read on races for select using (true);
drop policy if exists workout_blocks_read on workout_blocks;
create policy workout_blocks_read on workout_blocks for select using (true);
drop policy if exists benchmark_definitions_read on benchmark_definitions;
create policy benchmark_definitions_read on benchmark_definitions for select using (true);
