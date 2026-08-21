-- ============================================================================
-- Phase C2 + C4: Strava connection and subscription tier.
-- Strava tokens live on the profile (engine-adjacent, written server-side via
-- service role only — the RLS update policy already limits users to their own
-- row, and tokens are never sent to the browser).
-- ============================================================================

alter table athlete_profiles
  add column if not exists strava_athlete_id bigint,
  add column if not exists strava_access_token text,
  add column if not exists strava_refresh_token text,
  add column if not exists strava_expires_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists subscription_id text,
  add column if not exists subscription_status text;

create index if not exists athlete_profiles_strava_idx
  on athlete_profiles(strava_athlete_id);
