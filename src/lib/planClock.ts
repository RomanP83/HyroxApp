import type { SupabaseClient } from "@supabase/supabase-js";

const DAY_MS = 86_400_000;

function mondayUtc(isoDate: string): number {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  const day = date.getUTCDay();
  return date.getTime() - (day === 0 ? 6 : day - 1) * DAY_MS;
}

/** Calendar date at an instant in the deployment's training timezone. */
export function dateInTrainingZone(
  at: Date = new Date(),
  timeZone = process.env.APP_TIME_ZONE || "Europe/Berlin",
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Week 1 is the calendar week containing plan.generated_at. This matches the
 * Monday-based grid used by day_hint and the season calendar.
 */
function calendarPlanWeek(generatedAt: string, today: string): number {
  const generatedDate = generatedAt.length > 10
    ? dateInTrainingZone(new Date(generatedAt)) : generatedAt;
  const elapsed = Math.floor((mondayUtc(today) - mondayUtc(generatedDate)) / (7 * DAY_MS));
  return elapsed + 1;
}

export function planWeekNumber(
  generatedAt: string,
  totalWeeks: number,
  today = dateInTrainingZone(),
): number {
  return Math.max(1, Math.min(totalWeeks, calendarPlanWeek(generatedAt, today)));
}

/** ISO calendar dates, Monday through Sunday, for the selected plan week. */
export function planWeekDates(generatedAt: string, weekNumber: number): string[] {
  const generatedDate = generatedAt.length > 10
    ? dateInTrainingZone(new Date(generatedAt)) : generatedAt;
  const start = mondayUtc(generatedDate) + (weekNumber - 1) * 7 * DAY_MS;
  return Array.from({ length: 7 }, (_, day) =>
    new Date(start + day * DAY_MS).toISOString().slice(0, 10));
}

/** plan day_hint (Monday=1 … Sunday=7) for an ISO calendar date. */
export function dayHintForDate(isoDate: string): number {
  const day = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Keep the persisted status useful for queries made by reminders, wearables
 * and reviews. After the cycle all weeks are completed and the returned
 * number is total_weeks + 1, so cron callers can stop working on this plan.
 */
export async function syncPlanWeekStatuses(
  supabase: SupabaseClient,
  plan: { id: string; generated_at: string; total_weeks: number },
  today = dateInTrainingZone(),
): Promise<number> {
  const current = Math.max(1, Math.min(plan.total_weeks + 1, calendarPlanWeek(plan.generated_at, today)));
  const updates = [
    supabase
      .from("plan_weeks")
      .update({ status: "completed" })
      .eq("plan_id", plan.id)
      .lt("week_number", current)
      .neq("status", "rebased"),
    supabase
      .from("plan_weeks")
      .update({ status: "current" })
      .eq("plan_id", plan.id)
      .eq("week_number", current)
      .neq("status", "rebased"),
    supabase
      .from("plan_weeks")
      .update({ status: "upcoming" })
      .eq("plan_id", plan.id)
      .gt("week_number", current)
      .neq("status", "rebased"),
  ];
  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(`syncPlanWeekStatuses: ${failed.error.message}`);
  return current;
}
