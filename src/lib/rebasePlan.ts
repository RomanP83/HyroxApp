// ============================================================================
// Rebase (Roadmap B3, plan §5): "Rebase generiert immer ab heute neu statt
// alte Wochen zu mutieren." Regenerates the plan from today's remaining weeks
// to the same race date via the engine + the atomic persist_plan RPC (which
// also abandons the old plan in the same transaction). The Stripe payment id
// carries over — a paid race cycle stays paid across a rebase.
// Runs with the service-role client (nightly cron and the injury-recovery
// route both call it after ownership is established).
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePlan, type AthleteProfile } from "@/lib/engine";
import { loadLibrary, persistPlan } from "@/lib/persistPlan";
import { loadSeasonRaces, planWeeksTo, racesForPlan } from "@/lib/seasonCalendar";
import { loadDayOverrides } from "@/lib/dayOverrides";
import { raceIsBehind, weekStartOf } from "@/lib/planWeek";
import { stateFromRow, type AthleteStateRow } from "@/lib/dbTypes";

export async function rebasePlan(
  admin: SupabaseClient,
  planId: string,
  reason: string,
  /**
   * The Monday the rebuilt plan starts on. A rebase means "from today", so the
   * default is this week's Monday; the settings page passes a chosen date when
   * the athlete is deliberately moving the start.
   */
  startsOn?: string,
): Promise<string | null> {
  const { data: plan } = await admin
    .from("plans")
    .select("id, profile_id, race_id, race_date, stripe_payment_id")
    .eq("id", planId)
    .single();
  if (!plan) return null;

  const [{ data: profileRow }, { data: stateRow }] = await Promise.all([
    admin.from("athlete_profiles").select("*").eq("id", plan.profile_id).single(),
    admin.from("athlete_state").select("*").eq("profile_id", plan.profile_id).single(),
  ]);
  if (!profileRow || !stateRow) return null;

  const profile = profileRow as AthleteProfile;
  const state = stateFromRow(stateRow as AthleteStateRow);
  const library = await loadLibrary(admin);

  // A rebase must not lose the race calendar: the B and C races the athlete
  // entered are part of the plan, not decoration on the season page.
  const today = new Date().toISOString().slice(0, 10);
  const start = weekStartOf(startsOn?.slice(0, 10) ?? today, 1);
  const raceDate = String(plan.race_date).slice(0, 10);

  // Never rebase past a race that has already happened. planWeeksTo counts
  // weeks TO the race; against a date in the past it clamps to its floor and
  // hands back a two-week taper aimed at a day that is over. The guard lives
  // here rather than in each of the six callers, because any of them can be
  // reached the week after a race.
  if (raceIsBehind(raceDate, today)) return null;
  const calendar = await loadSeasonRaces(admin, plan.profile_id);
  const races = racesForPlan(
    calendar.some((r) => r.date === raceDate)
      ? calendar
      : [...calendar, { date: raceDate, type: "Race day", priority: "A" as const, is_anchor: true }],
    today,
    raceDate,
  );

  // The whole point of a rebase is to rebuild the weeks — but a week the
  // athlete rearranged by hand is a decision, not a proposal, so it goes back.
  const dayOverrides = await loadDayOverrides(admin, plan.profile_id, today);

  const generated = generatePlan({
    profile,
    state,
    library,
    weeksToRace: planWeeksTo(raceDate, start, 2),
    startDate: start,
    races,
    dayOverrides,
  });

  const newPlanId = await persistPlan(
    admin,
    {
      profileId: plan.profile_id,
      raceDate: plan.race_date,
      raceId: plan.race_id,
      stripePaymentId: plan.stripe_payment_id,
      startsOn: start,
    },
    generated,
  );

  await admin.from("plan_adjustments").insert({
    plan_id: newPlanId,
    layer: "macro",
    trigger: "pause",
    action_taken: { type: "rebase", from_plan: planId },
    reason,
  });

  return newPlanId;
}
