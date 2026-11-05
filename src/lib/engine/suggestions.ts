// ============================================================================
// AI coach suggestions — the gate between a language model and the plan.
//
// A model (src/lib/aiCoach.ts) reads the last weeks and proposes a handful of
// changes to upcoming sessions. It may only pick from a fixed menu:
//
//   move    — put a session on another day / half of the day
//   easier  — RPE target −1, duration −10 %
//   harder  — RPE target +1, duration +10 %
//   skip    — leave a session out
//
// This file decides, deterministically, which proposals are even shown. A
// proposal the rules refuse is dropped with the rule that refused it; the
// model never touches the plan, and an accepted proposal changes nothing
// until the athlete taps "Apply". The model chooses; the engine computes what
// the change means in numbers.
// ============================================================================

import {
  ACWR_SOFT,
  AI_DURATION_STEP_PCT,
  AI_MAX_SUGGESTIONS,
  AI_MIN_DURATION_MIN,
  AI_REASON_MAX_CHARS,
  AI_RPE_MAX,
  AI_RPE_MIN,
  AI_RPE_STEP,
} from "./constants";
import type { DaySlot, PhaseType, SessionType } from "./types";

export const SUGGESTION_ACTIONS = ["move", "easier", "harder", "skip"] as const;
export type SuggestionAction = (typeof SUGGESTION_ACTIONS)[number];

/** An upcoming session the model may make a proposal about. */
export interface SuggestionCandidate {
  id: string;
  title: string;
  session_type: SessionType;
  day_hint: number;
  day_slot: DaySlot;
  status: string;
  intensity_rpe_target: number;
  planned_duration_min: number;
  week: "current" | "next";
  phase: PhaseType | null;
  is_deload: boolean;
  /** The session falls in a vacation (vacation.ts). */
  on_vacation?: boolean;
}

export interface SuggestionContext {
  candidates: SuggestionCandidate[];
  acwr: number;
  /** Today, 1 = Monday … 7 = Sunday. Days before it in the current week are past. */
  today_day_hint: number;
}

/** What the model sent, before any rule has looked at it. */
export interface RawProposal {
  action?: unknown;
  session_id?: unknown;
  day_hint?: unknown;
  day_slot?: unknown;
  reason?: unknown;
}

export interface ValidSuggestion {
  id: string;
  action: SuggestionAction;
  session_id: string;
  title: string;
  reason: string;
  /** The change in plain words, computed here — not by the model. */
  change: string;
  /** move */
  day_hint?: number;
  day_slot?: DaySlot;
  /** easier / harder */
  rpe_to?: number;
  duration_to?: number;
}

export interface RejectedProposal {
  proposal: RawProposal;
  rule: string;
}

const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Sessions no suggestion may touch at all. */
const UNTOUCHABLE: SessionType[] = ["race_day"];
/** Sessions whose content is a measurement: they may move, never change. */
const FIXED_CONTENT: SessionType[] = ["benchmark", "race_day", "rest", "mobility"];

/** The numbers an easier/harder step produces for one session. */
export function intensityStep(
  c: Pick<SuggestionCandidate, "intensity_rpe_target" | "planned_duration_min">,
  direction: "easier" | "harder",
): { rpe: number; duration: number } {
  const sign = direction === "harder" ? 1 : -1;
  const rpe = Math.max(AI_RPE_MIN, Math.min(AI_RPE_MAX, c.intensity_rpe_target + sign * AI_RPE_STEP));
  const raw = c.planned_duration_min * (1 + sign * AI_DURATION_STEP_PCT);
  const duration = Math.max(AI_MIN_DURATION_MIN, Math.round(raw / 5) * 5);
  return { rpe, duration };
}

function refuse(c: SuggestionCandidate, action: SuggestionAction, ctx: SuggestionContext): string | null {
  if (UNTOUCHABLE.includes(c.session_type)) return "race_day_untouchable";
  if (c.status !== "planned") return "already_logged";
  if (action !== "move" && FIXED_CONTENT.includes(c.session_type)) return "fixed_content";
  if (action === "harder") {
    // Taper is never negotiable (PP4); a deload is a deload.
    if (c.phase === "taper") return "taper_never_harder";
    if (c.is_deload) return "deload_never_harder";
    if (c.on_vacation) return "vacation_never_harder";
    if (ctx.acwr >= ACWR_SOFT) return "acwr_too_high";
    if (c.intensity_rpe_target >= AI_RPE_MAX) return "rpe_at_max";
  }
  if (action === "easier" && c.intensity_rpe_target <= AI_RPE_MIN) return "rpe_at_min";
  if (c.week === "current" && c.day_hint < ctx.today_day_hint) return "in_the_past";
  return null;
}

/**
 * Check every proposal against the rules, in the order the model sent them.
 * At most AI_MAX_SUGGESTIONS survive, one per session.
 */
export function validateSuggestions(
  raw: unknown,
  ctx: SuggestionContext,
): { accepted: ValidSuggestion[]; rejected: RejectedProposal[] } {
  const accepted: ValidSuggestion[] = [];
  const rejected: RejectedProposal[] = [];
  const list: RawProposal[] = Array.isArray(raw)
    ? raw.filter((x): x is RawProposal => typeof x === "object" && x !== null)
    : [];
  const byId = new Map(ctx.candidates.map((c) => [c.id, c]));
  const used = new Set<string>();

  for (const p of list) {
    const no = (rule: string) => rejected.push({ proposal: p, rule });
    const action = SUGGESTION_ACTIONS.find((a) => a === p.action);
    if (!action) {
      no("unknown_action");
      continue;
    }
    const c = typeof p.session_id === "string" ? byId.get(p.session_id) : undefined;
    if (!c) {
      no("not_an_upcoming_session");
      continue;
    }
    if (used.has(c.id)) {
      no("duplicate_session");
      continue;
    }
    const reason = typeof p.reason === "string" ? p.reason.trim().slice(0, AI_REASON_MAX_CHARS) : "";
    if (!reason) {
      no("no_reason");
      continue;
    }
    const refused = refuse(c, action, ctx);
    if (refused) {
      no(refused);
      continue;
    }

    const base = { id: String(accepted.length + 1), action, session_id: c.id, title: c.title, reason };

    if (action === "move") {
      const day = typeof p.day_hint === "number" && Number.isInteger(p.day_hint) ? p.day_hint : NaN;
      const slot: DaySlot = p.day_slot === "pm" ? "pm" : "am";
      if (!(day >= 1 && day <= 7)) {
        no("invalid_day");
        continue;
      }
      if (day === c.day_hint && slot === c.day_slot) {
        no("no_change");
        continue;
      }
      if (c.week === "current" && day < ctx.today_day_hint) {
        no("in_the_past");
        continue;
      }
      // A swap partner that is a race day would move the race: refuse.
      const partner = ctx.candidates.find(
        (o) => o.week === c.week && o.day_hint === day && o.day_slot === slot,
      );
      if (partner && (UNTOUCHABLE.includes(partner.session_type) || partner.status !== "planned")) {
        no("target_slot_locked");
        continue;
      }
      if (accepted.length >= AI_MAX_SUGGESTIONS) {
        no("over_limit");
        continue;
      }
      used.add(c.id);
      accepted.push({
        ...base,
        day_hint: day,
        day_slot: slot,
        change: `${DAY[c.day_hint]} ${c.day_slot.toUpperCase()} → ${DAY[day]} ${slot.toUpperCase()}${
          partner ? ` (swaps with "${partner.title}")` : ""
        }`,
      });
      continue;
    }

    if (action === "skip") {
      if (accepted.length >= AI_MAX_SUGGESTIONS) {
        no("over_limit");
        continue;
      }
      used.add(c.id);
      accepted.push({ ...base, change: "Leave this session out" });
      continue;
    }

    const step = intensityStep(c, action);
    if (step.rpe === c.intensity_rpe_target && step.duration === c.planned_duration_min) {
      no("no_change");
      continue;
    }
    if (accepted.length >= AI_MAX_SUGGESTIONS) {
      no("over_limit");
      continue;
    }
    used.add(c.id);
    accepted.push({
      ...base,
      rpe_to: step.rpe,
      duration_to: step.duration,
      change: `RPE ${c.intensity_rpe_target} → ${step.rpe}, ${c.planned_duration_min} → ${step.duration} min`,
    });
  }

  return { accepted, rejected };
}
