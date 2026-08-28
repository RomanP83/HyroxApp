// ============================================================================
// Building a race cycle from the season calendar.
//
// Extracted so the nightly job can build one too: a transition block whose race
// has come into range has to become a race cycle by itself, or an athlete who
// entered a race a year out would sit in transition work until they noticed.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLibrary, persistPlan } from "@/lib/persistPlan";
import { loadDayOverrides } from "@/lib/dayOverrides";
import { generatePlan, type AthleteProfile, type AthleteState } from "@/lib/engine";
import { planWeeksTo, racesForPlan, type CalendarRace } from "@/lib/seasonCalendar";

/** Build and persist a race cycle aimed at `raceDate`. */
export async function buildRaceBlock(opts: {
  supabase: SupabaseClient;
  profile: AthleteProfile;
  state: AthleteState;
  raceDate: string;
  calendar: CalendarRace[];
  /** The Monday week 1 begins on. */
  startsOn: string;
  today: string;
  raceId?: string | null;
}): Promise<{ planId: string; weeksToRace: number }> {
  const { supabase, profile, state, raceDate, calendar, startsOn, today } = opts;
  const weeksToRace = planWeeksTo(raceDate, startsOn);
  const plan = generatePlan({
    profile,
    state,
    library: await loadLibrary(supabase),
    weeksToRace,
    startDate: startsOn,
    races: racesForPlan(calendar, today, raceDate),
    dayOverrides: await loadDayOverrides(supabase, profile.id, today),
  });
  const planId = await persistPlan(
    supabase,
    { profileId: profile.id, raceDate, raceId: opts.raceId ?? null, startsOn },
    plan,
  );
  return { planId, weeksToRace };
}
