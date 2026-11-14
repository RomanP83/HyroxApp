// ============================================================================
// A strength workout from MyHealthHub ticks off the planned strength session.
//
// The athlete trains with the Strength Tracker; the hub forwards each workout
// here. It is logged through the SAME path as a manual "Done": the
// transactional record_session_completion (log + sets + status in one step),
// the strength progression suggestions, and the micro-calibration. Undo works
// as for any log.
//
// Narrow matching, never a guess:
//   1. the active plan's CURRENT week only (as for Garmin runs),
//   2. an open strength session on the workout's day,
//   3. otherwise the open strength session of that week closest to that day,
//   4. otherwise nothing changes and the hub shows "not matched".
//
// Idempotent over the hub's workout id (hub_strength_links): the same workout
// twice logs once; an edited workout is undone and logged again with its new
// sets; a deleted one is undone.
// ============================================================================
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyMicroForSession } from "@/lib/adaptiveRunner";
import { resetSessionLog } from "@/lib/resetSession";
import { refreshStrengthSuggestions } from "@/lib/strength/record";
import { computeSessionFeedback } from "@/lib/engine";
import { currentWeekNumber } from "@/lib/planWeek";
import { dateInTrainingZone, dayHintForDate } from "@/lib/planClock";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const HubStrengthBody = z.union([
  z.object({ hub_workout_id: z.string().min(1).max(100), deleted: z.literal(true) }),
  z.object({
    hub_workout_id: z.string().min(1).max(100),
    deleted: z.literal(false),
    date: isoDate,
    title: z.string().max(200).nullish(),
    duration_min: z.number().int().positive().max(600).nullish(),
    rpe: z.number().int().min(1).max(10).nullish(),
    notes: z.string().max(2000).nullish(),
    sets: z
      .array(
        z.object({
          exercise_name: z.string().min(1).max(120),
          set_number: z.number().int().min(1).max(12),
          reps: z.number().int().min(0).max(200).nullable(),
          load_kg: z.number().min(0).max(1000).nullable(),
        }),
      )
      .max(60)
      .default([]),
  }),
]);
export type HubStrengthBody = z.infer<typeof HubStrengthBody>;
type Workout = Extract<HubStrengthBody, { deleted: false }>;

export interface StrengthCandidate {
  id: string;
  day_hint: number;
}

/** Same day first, then the open session of the week closest to that day (earlier wins a tie). */
export function pickStrengthSession<T extends StrengthCandidate>(open: T[], dayHint: number): T | null {
  if (!open.length) return null;
  const sameDay = open.find((s) => s.day_hint === dayHint);
  if (sameDay) return sameDay;
  return [...open].sort((a, b) => Math.abs(a.day_hint - dayHint) - Math.abs(b.day_hint - dayHint) || a.day_hint - b.day_hint)[0];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Hub sets → record_session_completion's p_strength_sets, with the athlete's own exercise ids where names match. */
export function mapSets(sets: Workout["sets"], exercises: { id: string; name: string }[]) {
  const byName = new Map(exercises.map((e) => [norm(e.name), e.id]));
  return sets
    .filter((s) => s.reps != null || s.load_kg != null)
    .map((s) => ({
      exercise_id: byName.get(norm(s.exercise_name)) ?? null,
      exercise_name: s.exercise_name.trim(),
      set_number: s.set_number,
      reps: s.reps,
      load_kg: s.load_kg,
    }));
}

export type HubStrengthResult =
  | { ok: true; matched: true; session_id: string; title: string; relogged?: boolean }
  | { ok: true; matched: false; reason: string }
  | { ok: true; undone: boolean };

async function findSession(admin: SupabaseClient, profileId: string, date: string) {
  const { data: plan, error } = await admin
    .from("plans")
    .select("id, starts_on, total_weeks")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("plan lookup failed");
  if (!plan) return { reason: "kein aktiver Plan" } as const;

  const grid = { startsOn: String(plan.starts_on).slice(0, 10), totalWeeks: plan.total_weeks };
  const today = dateInTrainingZone();
  if (date < grid.startsOn || date > today) return { reason: "Datum außerhalb des Plans" } as const;
  const week = currentWeekNumber({ ...grid, today: date });
  if (week !== currentWeekNumber({ ...grid, today })) return { reason: "nicht in der laufenden Planwoche" } as const;

  const { data: weekRow } = await admin.from("plan_weeks").select("id").eq("plan_id", plan.id).eq("week_number", week).maybeSingle();
  if (!weekRow) return { reason: "Planwoche fehlt" } as const;

  const { data: open, error: openError } = await admin
    .from("sessions")
    .select("id, day_hint, title, session_type, intensity_rpe_target, planned_duration_min")
    .eq("week_id", weekRow.id)
    .eq("session_type", "strength")
    .in("status", ["planned", "moved"]);
  if (openError) throw new Error("session lookup failed");
  const session = pickStrengthSession(open ?? [], dayHintForDate(date));
  return session ? ({ session } as const) : ({ reason: "keine offene Krafteinheit in dieser Woche" } as const);
}

async function logWorkout(
  admin: SupabaseClient,
  profileId: string,
  session: { id: string; title: string; intensity_rpe_target: number; planned_duration_min: number; session_type: string },
  w: Workout,
) {
  const { data: templates } = await admin.from("strength_templates").select("id").eq("profile_id", profileId);
  const { data: exercises } = templates?.length
    ? await admin.from("strength_exercises").select("id, name").in("template_id", templates.map((t) => t.id))
    : { data: [] as { id: string; name: string }[] };
  const sets = mapSets(w.sets, exercises ?? []);
  const rpe = w.rpe ?? session.intensity_rpe_target;
  const duration = w.duration_min ?? session.planned_duration_min;

  const { data, error } = await admin.rpc("record_session_completion", {
    p_session: session.id,
    p_completed_as_planned: false,
    p_rpe: rpe,
    p_duration: duration,
    p_block_results: sets.map((s) => ({ exercise: s.exercise_name, set_number: s.set_number, reps_actual: s.reps, load_actual: s.load_kg })),
    p_notes: [`Aus MyHealthHub (Strength Tracker)${w.title ? `: ${w.title}` : ""}`, w.notes].filter(Boolean).join("\n"),
    p_strength_sets: sets,
    p_completed_at: `${w.date}T12:00:00Z`,
  });
  if (error) throw new Error(`log: ${error.message}`);
  if (!data?.created) return false;

  await refreshStrengthSuggestions(admin, sets.map((s) => s.exercise_id).filter((id): id is string => !!id)).catch(() => []);
  await applyMicroForSession(admin, session.id);
  const feedback = computeSessionFeedback({
    sessionType: session.session_type as never,
    sessionTitle: session.title,
    rpeTarget: session.intensity_rpe_target,
    rpeActual: rpe,
    plannedDurationMin: session.planned_duration_min,
    actualDurationMin: duration,
  });
  await admin.from("session_logs").update({ feedback }).eq("session_id", session.id);
  return true;
}

export async function handleHubStrength(admin: SupabaseClient, profileId: string, body: HubStrengthBody): Promise<HubStrengthResult> {
  const { data: link } = await admin
    .from("hub_strength_links")
    .select("session_id")
    .eq("profile_id", profileId)
    .eq("hub_workout_id", body.hub_workout_id)
    .maybeSingle();

  if (body.deleted) {
    if (!link) return { ok: true, undone: false };
    if (link.session_id) await resetSessionLog(admin, link.session_id);
    await admin.from("hub_strength_links").delete().eq("profile_id", profileId).eq("hub_workout_id", body.hub_workout_id);
    return { ok: true, undone: true };
  }

  // Already linked: the workout was edited in the tracker. Undo and log again,
  // so sets, effort and calibration all reflect the new version.
  if (link?.session_id) {
    const { data: session } = await admin
      .from("sessions")
      .select("id, title, session_type, intensity_rpe_target, planned_duration_min")
      .eq("id", link.session_id)
      .maybeSingle();
    if (session) {
      await resetSessionLog(admin, session.id);
      await logWorkout(admin, profileId, session, body);
      await admin.from("hub_strength_links").update({ updated_at: new Date().toISOString() }).eq("profile_id", profileId).eq("hub_workout_id", body.hub_workout_id);
      return { ok: true, matched: true, session_id: session.id, title: session.title, relogged: true };
    }
  }

  const found = await findSession(admin, profileId, body.date);
  if (!("session" in found) || !found.session) return { ok: true, matched: false, reason: found.reason ?? "nicht gefunden" };
  const logged = await logWorkout(admin, profileId, found.session, body);
  if (!logged) return { ok: true, matched: false, reason: "Einheit war schon geloggt" };
  await admin
    .from("hub_strength_links")
    .upsert({ profile_id: profileId, hub_workout_id: body.hub_workout_id, session_id: found.session.id, updated_at: new Date().toISOString() }, { onConflict: "profile_id,hub_workout_id" });
  return { ok: true, matched: true, session_id: found.session.id, title: found.session.title };
}
