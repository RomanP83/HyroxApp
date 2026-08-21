import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase/server";
import { loadLibrary, persistPlan } from "@/lib/persistPlan";
import { generatePlan, initialAthleteState, type AthleteProfile } from "@/lib/engine";

const Body = z.object({
  division: z.enum(["open", "pro", "doubles", "masters_open", "masters_pro"]),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]),
  five_k_seconds: z.number().int().positive().nullable().optional(),
  station_estimates: z.record(z.number()).optional(),
  training_days_per_week: z.number().int().min(3).max(6),
  doubles_per_week: z.number().int().min(0).max(3).optional(),
  equipment_access: z.enum(["full_gym", "home_minimal", "hybrid"]),
  telegram_chat_id: z.string().optional(),
  race_date: z.string(), // ISO date
  race_id: z.string().uuid().nullable().optional(),
});

function weeksUntil(raceDate: string): number {
  const ms = new Date(raceDate).getTime() - Date.now();
  const weeks = Math.ceil(ms / (7 * 86_400_000));
  return Math.max(4, Math.min(20, weeks));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 1) Upsert the athlete profile (RLS: user owns it).
  const { data: profileRow, error: profileErr } = await supabase
    .from("athlete_profiles")
    .upsert(
      {
        user_id: user.id,
        division: body.division,
        experience_level: body.experience_level,
        five_k_seconds: body.five_k_seconds ?? null,
        station_estimates: body.station_estimates ?? {},
        training_days_per_week: body.training_days_per_week,
        doubles_per_week: body.doubles_per_week ?? 0,
        equipment_access: body.equipment_access,
        telegram_chat_id: body.telegram_chat_id ?? null,
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (profileErr || !profileRow) {
    return NextResponse.json({ error: "profile_upsert_failed", detail: profileErr?.message }, { status: 500 });
  }

  const profile = profileRow as AthleteProfile;

  // 2) Initialise the living athlete_state (service role — engine-owned table).
  const admin = supabaseAdmin();
  const state = initialAthleteState(profile);
  await admin.from("athlete_state").upsert(
    {
      profile_id: profile.id,
      acute_load_7d: state.acute_load_7d,
      chronic_load_28d: state.chronic_load_28d,
      acwr: state.acwr,
      pace_zones: state.pace_zones,
      station_tiers: state.station_tiers,
      predicted_race_time_sec: state.predicted_race_time_sec,
      strength_modifier: state.strength_modifier,
      pace_zones_ref: state.pace_zones_ref,
      pace_ref_at: state.pace_ref_at,
      last_recalc_at: new Date().toISOString(),
    },
    { onConflict: "profile_id" },
  );

  // 3) Generate + persist the plan.
  const weeksToRace = weeksUntil(body.race_date);
  const library = await loadLibrary(supabase);
  const plan = generatePlan({ profile, state, library, weeksToRace });
  const planId = await persistPlan(
    supabase,
    { profileId: profile.id, raceDate: body.race_date, raceId: body.race_id ?? null },
    plan,
  );

  return NextResponse.json({ planId, weeksToRace, predicted_race_time_sec: state.predicted_race_time_sec });
}
