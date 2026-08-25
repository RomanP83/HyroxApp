import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/SettingsClient";
import { assessVolumeTarget, type ExperienceLevel, type PaceZones } from "@/lib/engine";
import { recentWeeklyRunKm } from "@/lib/runVolume";
import { signDeepLink } from "@/lib/telegram";
import { stravaConfigured } from "@/lib/strava";
import { garminConfigured } from "@/lib/garmin";

export const dynamic = "force-dynamic";

// Setup & tools. Reachable without a plan: the week shape and the volume are
// exactly what someone wants to set BEFORE generating one.
export default async function SettingsPage() {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/onboarding");

  const { data: profile } = await supabase
    .from("athlete_profiles")
    .select(
      "id, experience_level, training_days_per_week, doubles_per_week, weekly_km_peak, runs_per_week, telegram_chat_id, strava_athlete_id, garmin_user_id, preferred_long_run_day, preferred_strength_days, preferred_rest_days, preferred_double_days",
    )
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/onboarding");

  const { data: plan } = await supabase
    .from("plans")
    .select("id, status, total_weeks")
    .eq("profile_id", profile.id)
    .in("status", ["active", "paused", "rehab"])
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const trainingDays = profile.training_days_per_week ?? 4;
  const peakKm = profile.weekly_km_peak == null ? null : Number(profile.weekly_km_peak);

  // The volume assessment measures a target against what the last four weeks
  // actually carried, and against how long there is to ramp into it — so it
  // needs the athlete's pace zones and where the plan currently stands.
  let assessment = null;
  if (peakKm && plan) {
    const [{ data: state }, { data: phases }, { data: current }] = await Promise.all([
      supabase.from("athlete_state").select("pace_zones").eq("profile_id", profile.id).maybeSingle(),
      supabase.from("plan_phases").select("phase_type, end_week").eq("plan_id", plan.id),
      supabase
        .from("plan_weeks")
        .select("week_number")
        .eq("plan_id", plan.id)
        .eq("status", "current")
        .maybeSingle(),
    ]);
    const zones = (state?.pace_zones ?? {}) as PaceZones;
    if (Object.keys(zones).length) {
      const build = (phases ?? []).find((p) => p.phase_type === "build") as
        | { end_week: number }
        | undefined;
      assessment = assessVolumeTarget({
        targetKm: peakKm,
        recentWeeklyKm: await recentWeeklyRunKm(supabase, zones),
        weeksToPeak: Math.max(
          0,
          (build?.end_week ?? plan.total_weeks) - (current?.week_number ?? 1),
        ),
      });
    }
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;

  return (
    <SettingsClient
      hasPlan={Boolean(plan)}
      planStatus={plan?.status ?? "none"}
      experienceLevel={(profile.experience_level as ExperienceLevel) ?? "intermediate"}
      weekShape={{
        training_days_per_week: trainingDays,
        doubles_per_week: profile.doubles_per_week ?? 0,
        long_run_day: (profile.preferred_long_run_day as number | null) ?? null,
        strength_days: (profile.preferred_strength_days as number[] | null) ?? [],
        rest_days: (profile.preferred_rest_days as number[] | null) ?? [],
        double_days: (profile.preferred_double_days as number[] | null) ?? [],
      }}
      volume={{
        weekly_km_peak: peakKm,
        runs_per_week: profile.runs_per_week ?? null,
        assessment,
      }}
      connections={{
        strava: {
          connected: Boolean(profile.strava_athlete_id),
          url: stravaConfigured() ? "/api/strava/connect" : null,
        },
        garmin: {
          connected: Boolean(profile.garmin_user_id),
          url: garminConfigured() ? "/api/garmin/connect" : null,
        },
        telegram: {
          connected: Boolean(profile.telegram_chat_id),
          url: botUsername ? `https://t.me/${botUsername}?start=${signDeepLink(profile.id)}` : null,
        },
      }}
    />
  );
}
