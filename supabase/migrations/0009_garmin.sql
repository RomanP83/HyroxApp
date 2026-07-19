-- ============================================================================
-- Garmin Connect sync — runs only (user request; extends the C2 pattern).
-- Tokens are server-side only, same handling as the Strava columns.
-- ============================================================================

alter table athlete_profiles
  add column if not exists garmin_user_id text,
  add column if not exists garmin_access_token text,
  add column if not exists garmin_refresh_token text,
  add column if not exists garmin_expires_at timestamptz;

create index if not exists athlete_profiles_garmin_idx
  on athlete_profiles(garmin_user_id);
