// ============================================================================
// AI coach (server-only): a language model reviews the last weeks and
// proposes a few changes to the upcoming sessions.
//
// The split of duties is the point of this file:
//   - the facts are gathered here from the database, as numbers;
//   - Gemini writes a review and picks proposals from a fixed menu;
//   - the engine (validateSuggestions) decides which proposals are allowed
//     and computes what each one means in numbers;
//   - nothing changes the plan until the athlete taps "Apply"
//     (PATCH /api/ai/suggestions/[id]), which runs through the same paths as
//     a manual move, and is audited and undoable.
// Without GEMINI_API_KEY nothing here runs and the app works as before.
// ============================================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACWR_HARD,
  ACWR_LOW,
  ACWR_SOFT,
  AI_REVIEW_MAX_CHARS,
  SUGGESTION_ACTIONS,
  VACATION_TITLE_PREFIX,
  analyseRaces,
  validateSuggestions,
  type DaySlot,
  type PhaseType,
  type RaceResult,
  type RejectedProposal,
  type SessionType,
  type SuggestionCandidate,
  type SuggestionContext,
  type ValidSuggestion,
} from "@/lib/engine";
import { weekStartOf } from "@/lib/dayOverrides";
import { geminiJson } from "@/lib/gemini";

/** Pressing the button twice within this window returns the same review. */
export const AI_COACH_MIN_INTERVAL_MIN = 10;
const DAY_MS = 86_400_000;
const HISTORY_DAYS = 21;

export type SuggestionStatus = "open" | "applied" | "dismissed";

export interface StoredSuggestion extends ValidSuggestion {
  status: SuggestionStatus;
  applied_at?: string;
  /** What "Undo" needs to put back. */
  undo?: { day_hint?: number; day_slot?: DaySlot; rpe?: number; duration?: number; status?: string };
}

export interface SuggestionRow {
  id: string;
  profile_id: string;
  plan_id: string;
  created_at: string;
  model: string;
  review: string;
  items: StoredSuggestion[];
  rejected: RejectedProposal[];
}

export interface CoachFacts {
  today: { date: string; day_hint: number };
  athlete: {
    division: string;
    experience_level: string;
    race_date: string;
    days_to_race: number;
    target_time_sec: number | null;
    predicted_finish_sec: number | null;
    phase: PhaseType | null;
    week_number: number;
    is_deload: boolean;
    weekly_goal: string | null;
  };
  load: {
    acwr: number;
    acute_7d: number;
    chronic_28d: number;
    guardrails: { ramp_up_below: number; trim_from: number; auto_deload_from: number };
  };
  race_analysis: {
    latest_total_sec: number | null;
    gap_to_target_sec: number | null;
    readiness_pct: number | null;
    furthest_behind: { segment: string; gap_sec: number }[];
    post_bbj_pace_loss_sec_km: number | null;
    run_fade_sec_km: number | null;
  } | null;
  recent_sessions: {
    date: string;
    title: string;
    type: SessionType;
    rpe_target: number;
    rpe_actual: number | null;
    planned_min: number;
    actual_min: number | null;
    as_planned: boolean;
    fulfillment: number | null;
    notes: string | null;
  }[];
  skipped_recent: string[];
  /** Sessions imported from the old tracker in the same 21 days, if any. */
  imported_recent: { date: string; kind: string; title: string | null; duration_min: number | null; rpe: number | null }[];
  upcoming: {
    session_id: string;
    week: "current" | "next";
    day_hint: number;
    day_slot: DaySlot;
    title: string;
    type: SessionType;
    rpe_target: number;
    duration_min: number;
    status: string;
  }[];
}

export function coachLanguage(): string {
  return process.env.AI_COACH_LANGUAGE?.trim() || "German";
}

export function coachSystemPrompt(language: string): string {
  return `You are the reviewing coach inside a Hyrox training app. A deterministic engine builds the plan and adapts it after every logged session; you do not plan. You receive facts about the athlete's last three weeks and the upcoming sessions, and you return:

1. "review": 3-6 sentences on how training is going — what went well, what the numbers worry you about, what to watch next week.
2. "suggestions": at most 3 proposals, each picking ONE action from this menu:
   - "move": put a session on another day (day_hint 1 = Monday … 7 = Sunday, day_slot "am"/"pm"). An occupied slot is swapped.
   - "easier": lower that session's effort one step.
   - "harder": raise that session's effort one step.
   - "skip": leave that session out.

Rules:
- Use ONLY the numbers in the facts. Never invent paces, weights, times or claims.
- An empty suggestions list is a good answer when the plan fits. Do not propose change for its own sake.
- session_id must be copied exactly from "upcoming", and only for status "planned".
- Never make a taper, deload or vacation session harder. Sessions titled "Vacation · …" are the athlete's holiday — leave them easy. Never propose "harder" when acwr is at or above the trim guardrail.
- Days before today.day_hint in the current week are past — never move a session there.
- Prefer "move" or "easier" over "skip". Race days are never touched.
- Each reason is one or two sentences and cites the fact it rests on (e.g. two sessions logged two RPE points above target).
- No medical advice, no diagnosis. If notes mention pain, say to have it checked and keep proposals conservative.
- Write the review and every reason in ${language}. Plain prose, no lists, no emojis.`;
}

export const COACH_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    review: { type: "STRING" },
    suggestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          action: { type: "STRING", enum: [...SUGGESTION_ACTIONS] },
          session_id: { type: "STRING" },
          day_hint: { type: "INTEGER" },
          day_slot: { type: "STRING", enum: ["am", "pm"] },
          reason: { type: "STRING" },
        },
        required: ["action", "session_id", "reason"],
      },
    },
  },
  required: ["review", "suggestions"],
};

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Gather the facts the model sees and the context the validator checks
 * against. Uses the service-role client: callers check ownership first.
 */
export async function loadCoachContext(
  admin: SupabaseClient,
  planId: string,
  now: Date = new Date(),
): Promise<{ facts: CoachFacts; ctx: SuggestionContext; profileId: string } | null> {
  const { data: plan } = await admin
    .from("plans")
    .select("id, profile_id, race_date, generated_at")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return null;

  const [{ data: weeks }, { data: phases }, { data: state }, { data: profile }, { data: raceRows }] =
    await Promise.all([
      admin
        .from("plan_weeks")
        .select("id, week_number, is_deload, weekly_goal, status")
        .eq("plan_id", planId)
        .order("week_number"),
      admin.from("plan_phases").select("phase_type, start_week, end_week").eq("plan_id", planId),
      admin.from("athlete_state").select("*").eq("profile_id", plan.profile_id).maybeSingle(),
      admin.from("athlete_profiles").select("*").eq("id", plan.profile_id).maybeSingle(),
      admin
        .from("race_results")
        .select("id, kind, held_on, label, is_baseline, total_sec, runs_sec, stations_sec, roxzone_sec")
        .eq("profile_id", plan.profile_id),
    ]);

  const weekList = (weeks ?? []) as {
    id: string;
    week_number: number;
    is_deload: boolean;
    weekly_goal: string | null;
    status: string;
  }[];
  const current = weekList.find((w) => w.status === "current") ?? weekList[0];
  if (!current) return null;
  const next = weekList.find((w) => w.week_number === current.week_number + 1) ?? null;
  const recentWeeks = weekList.filter(
    (w) => w.week_number >= current.week_number - 2 && w.week_number <= current.week_number,
  );
  const phaseOf = (n: number) =>
    ((phases ?? []).find((p: { start_week: number; end_week: number }) => n >= p.start_week && n <= p.end_week)
      ?.phase_type ?? null) as PhaseType | null;

  // Today's place in the current calendar week: the same Monday grid the
  // day overrides and race calendar use.
  const weekStart = new Date(`${weekStartOf(plan.generated_at, current.week_number)}T00:00:00Z`).getTime();
  const todayDayHint = Math.max(1, Math.min(7, Math.floor((utcMidnight(now) - weekStart) / DAY_MS) + 1));

  const weekIds = [...new Set([...recentWeeks.map((w) => w.id), ...(next ? [next.id] : [])])];
  const since = new Date(now.getTime() - HISTORY_DAYS * DAY_MS).toISOString();
  const [{ data: sessions }, { data: logs }, { data: imported }] = await Promise.all([
    admin
      .from("sessions")
      .select("id, week_id, day_hint, day_slot, session_type, title, planned_duration_min, intensity_rpe_target, status")
      .in("week_id", weekIds),
    admin
      .from("session_logs")
      .select(
        "completed_at, completed_as_planned, rpe_actual, duration_actual_min, notes, feedback, sessions!inner(plan_id, title, session_type, intensity_rpe_target, planned_duration_min)",
      )
      .eq("sessions.plan_id", planId)
      .gte("completed_at", since)
      .order("completed_at", { ascending: true }),
    // Migration 0030; without it this errors and the list stays empty.
    admin
      .from("imported_workouts")
      .select("done_on, kind, title, duration_min, rpe")
      .eq("profile_id", plan.profile_id)
      .gte("done_on", since.slice(0, 10))
      .order("done_on", { ascending: true }),
  ]);

  const sessionList = (sessions ?? []) as {
    id: string;
    week_id: string;
    day_hint: number;
    day_slot: DaySlot | null;
    session_type: SessionType;
    title: string;
    planned_duration_min: number;
    intensity_rpe_target: number;
    status: string;
  }[];

  const candidates: SuggestionCandidate[] = sessionList
    .filter((s) => s.week_id === current.id || s.week_id === next?.id)
    .map((s): SuggestionCandidate => {
      const week = s.week_id === current.id ? current : (next as NonNullable<typeof next>);
      return {
        id: s.id,
        title: s.title,
        session_type: s.session_type,
        day_hint: s.day_hint,
        day_slot: s.day_slot ?? "am",
        status: s.status,
        intensity_rpe_target: s.intensity_rpe_target,
        planned_duration_min: s.planned_duration_min,
        week: s.week_id === current.id ? "current" : "next",
        phase: phaseOf(week.week_number),
        is_deload: week.is_deload,
        on_vacation: s.title.startsWith(VACATION_TITLE_PREFIX),
      };
    })
    .sort((a, b) => (a.week === b.week ? a.day_hint - b.day_hint : a.week === "current" ? -1 : 1));

  const analysis = analyseRaces(
    ((raceRows ?? []) as RaceResult[]),
    typeof profile?.target_time_sec === "number" ? profile.target_time_sec : null,
  );
  const hasRaces = (raceRows ?? []).length > 0;

  const acwr = Number(state?.acwr ?? 1);
  const facts: CoachFacts = {
    today: { date: new Date(utcMidnight(now)).toISOString().slice(0, 10), day_hint: todayDayHint },
    athlete: {
      division: String(profile?.division ?? "open"),
      experience_level: String(profile?.experience_level ?? "intermediate"),
      race_date: String(plan.race_date),
      days_to_race: Math.max(
        0,
        Math.round((new Date(`${String(plan.race_date).slice(0, 10)}T00:00:00Z`).getTime() - utcMidnight(now)) / DAY_MS),
      ),
      target_time_sec: analysis.target_sec,
      predicted_finish_sec: state?.predicted_race_time_sec ?? null,
      phase: phaseOf(current.week_number),
      week_number: current.week_number,
      is_deload: current.is_deload,
      weekly_goal: current.weekly_goal,
    },
    load: {
      acwr,
      acute_7d: Number(state?.acute_load_7d ?? 0),
      chronic_28d: Number(state?.chronic_load_28d ?? 0),
      guardrails: { ramp_up_below: ACWR_LOW, trim_from: ACWR_SOFT, auto_deload_from: ACWR_HARD },
    },
    race_analysis: hasRaces
      ? {
          latest_total_sec: analysis.latest?.total_sec ?? null,
          gap_to_target_sec: analysis.total_gap,
          readiness_pct: analysis.readiness,
          furthest_behind: analysis.weakest.map((s) => ({ segment: s.label, gap_sec: s.gap as number })),
          post_bbj_pace_loss_sec_km: analysis.post_bbj_loss.latest,
          run_fade_sec_km: analysis.run_fade.latest,
        }
      : null,
    recent_sessions: ((logs ?? []) as any[]).map((l) => ({
      date: String(l.completed_at).slice(0, 10),
      title: l.sessions.title,
      type: l.sessions.session_type,
      rpe_target: l.sessions.intensity_rpe_target,
      rpe_actual: l.rpe_actual,
      planned_min: l.sessions.planned_duration_min,
      actual_min: l.duration_actual_min,
      as_planned: Boolean(l.completed_as_planned),
      fulfillment: typeof l.feedback?.score === "number" ? l.feedback.score : null,
      notes: l.notes ? String(l.notes).slice(0, 300) : null,
    })),
    skipped_recent: sessionList
      .filter((s) => s.status === "skipped" && recentWeeks.some((w) => w.id === s.week_id))
      .map((s) => s.title),
    imported_recent: ((imported ?? []) as { done_on: string; kind: string; title: string | null; duration_min: number | null; rpe: number | string | null }[]).map((r) => ({
      date: r.done_on,
      kind: r.kind,
      title: r.title,
      duration_min: r.duration_min,
      rpe: r.rpe == null ? null : Number(r.rpe),
    })),
    upcoming: candidates.map((c) => ({
      session_id: c.id,
      week: c.week,
      day_hint: c.day_hint,
      day_slot: c.day_slot,
      title: c.title,
      type: c.session_type,
      rpe_target: c.intensity_rpe_target,
      duration_min: c.planned_duration_min,
      status: c.status,
    })),
  };

  return { facts, ctx: { candidates, acwr, today_day_hint: todayDayHint }, profileId: plan.profile_id };
}

/**
 * Review + proposals for a plan, stored in ai_suggestions. A row younger than
 * AI_COACH_MIN_INTERVAL_MIN is returned as-is instead of paying for a new one.
 */
export async function generateCoachSuggestions(
  admin: SupabaseClient,
  planId: string,
  now: Date = new Date(),
): Promise<{ ok: true; row: SuggestionRow; fresh: boolean } | { ok: false; error: string; detail?: string }> {
  const { data: recent } = await admin
    .from("ai_suggestions")
    .select("*")
    .eq("plan_id", planId)
    .gte("created_at", new Date(now.getTime() - AI_COACH_MIN_INTERVAL_MIN * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) return { ok: true, row: recent as SuggestionRow, fresh: false };

  const loaded = await loadCoachContext(admin, planId, now);
  if (!loaded) return { ok: false, error: "no_plan_week" };

  const answer = await geminiJson<{ review?: unknown; suggestions?: unknown }>(
    coachSystemPrompt(coachLanguage()),
    JSON.stringify(loaded.facts),
    COACH_RESPONSE_SCHEMA,
  );
  if (!answer.ok) return { ok: false, error: answer.error, detail: answer.detail };

  const review = typeof answer.data.review === "string" ? answer.data.review.trim().slice(0, AI_REVIEW_MAX_CHARS) : "";
  if (!review) return { ok: false, error: "bad_json", detail: "no review" };
  const { accepted, rejected } = validateSuggestions(answer.data.suggestions, loaded.ctx);

  const { data: row, error } = await admin
    .from("ai_suggestions")
    .insert({
      profile_id: loaded.profileId,
      plan_id: planId,
      model: answer.model,
      review,
      items: accepted.map((a) => ({ ...a, status: "open" })),
      rejected,
    })
    .select("*")
    .single();
  if (error || !row) return { ok: false, error: "store_failed", detail: error?.message };
  return { ok: true, row: row as SuggestionRow, fresh: true };
}
