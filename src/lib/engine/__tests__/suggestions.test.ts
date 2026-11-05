import { describe, it, expect } from "vitest";
import {
  intensityStep,
  validateSuggestions,
  type SuggestionCandidate,
  type SuggestionContext,
} from "../suggestions";
import { AI_MAX_SUGGESTIONS } from "../constants";

function cand(overrides: Partial<SuggestionCandidate> = {}): SuggestionCandidate {
  return {
    id: "a",
    title: "Threshold intervals",
    session_type: "run_intervals",
    day_hint: 4,
    day_slot: "am",
    status: "planned",
    intensity_rpe_target: 7,
    planned_duration_min: 60,
    week: "current",
    phase: "build",
    is_deload: false,
    ...overrides,
  };
}

function ctx(candidates: SuggestionCandidate[], extra: Partial<SuggestionContext> = {}): SuggestionContext {
  return { candidates, acwr: 1.0, today_day_hint: 3, ...extra };
}

describe("intensityStep", () => {
  it("steps RPE by one and duration by 10 %, rounded to 5 min", () => {
    expect(intensityStep(cand(), "easier")).toEqual({ rpe: 6, duration: 55 });
    expect(intensityStep(cand(), "harder")).toEqual({ rpe: 8, duration: 65 });
  });
});

describe("validateSuggestions", () => {
  it("accepts a valid easier proposal and computes the change itself", () => {
    const { accepted, rejected } = validateSuggestions(
      [{ action: "easier", session_id: "a", reason: "Two sessions felt harder than planned." }],
      ctx([cand()]),
    );
    expect(rejected).toEqual([]);
    expect(accepted[0]).toMatchObject({ action: "easier", rpe_to: 6, duration_to: 55 });
    expect(accepted[0].change).toBe("RPE 7 → 6, 60 → 55 min");
  });

  it("refuses unknown actions, unknown sessions and missing reasons", () => {
    const { accepted, rejected } = validateSuggestions(
      [
        { action: "delete_plan", session_id: "a", reason: "x" },
        { action: "easier", session_id: "nope", reason: "x" },
        { action: "easier", session_id: "a", reason: "  " },
      ],
      ctx([cand()]),
    );
    expect(accepted).toEqual([]);
    expect(rejected.map((r) => r.rule)).toEqual(["unknown_action", "not_an_upcoming_session", "no_reason"]);
  });

  it("never makes taper or deload sessions harder, nor anything when ACWR is high", () => {
    const rules = (c: SuggestionCandidate, extra: Partial<SuggestionContext> = {}) =>
      validateSuggestions([{ action: "harder", session_id: c.id, reason: "felt easy" }], ctx([c], extra)).rejected[0]
        ?.rule;
    expect(rules(cand({ phase: "taper" }))).toBe("taper_never_harder");
    expect(rules(cand({ is_deload: true }))).toBe("deload_never_harder");
    expect(rules(cand({ on_vacation: true }))).toBe("vacation_never_harder");
    expect(rules(cand(), { acwr: 1.35 })).toBe("acwr_too_high");
    expect(rules(cand({ intensity_rpe_target: 9 }))).toBe("rpe_at_max");
  });

  it("leaves race days, logged sessions and past days alone", () => {
    const { rejected } = validateSuggestions(
      [
        { action: "skip", session_id: "race", reason: "x" },
        { action: "easier", session_id: "done", reason: "x" },
        { action: "skip", session_id: "past", reason: "x" },
      ],
      ctx([
        cand({ id: "race", session_type: "race_day", day_hint: 6 }),
        cand({ id: "done", status: "done", day_hint: 5 }),
        cand({ id: "past", day_hint: 1 }),
      ]),
    );
    expect(rejected.map((r) => r.rule)).toEqual(["race_day_untouchable", "already_logged", "in_the_past"]);
  });

  it("lets a benchmark move but never changes its content", () => {
    const b = cand({ id: "b", session_type: "benchmark" });
    const { accepted, rejected } = validateSuggestions(
      [
        { action: "easier", session_id: "b", reason: "x" },
        { action: "move", session_id: "b", day_hint: 5, day_slot: "am", reason: "fresher on Friday" },
      ],
      ctx([b]),
    );
    expect(rejected[0].rule).toBe("fixed_content");
    expect(accepted[0]).toMatchObject({ action: "move", day_hint: 5, day_slot: "am" });
  });

  it("checks moves: valid day, no-op, past day, locked swap partner", () => {
    const c = [
      cand(),
      cand({ id: "race", session_type: "race_day", day_hint: 6, title: "Race" }),
      cand({ id: "easy", session_type: "run_easy", day_hint: 5, title: "Easy run" }),
    ];
    const { accepted, rejected } = validateSuggestions(
      [
        { action: "move", session_id: "a", day_hint: 9, reason: "x" },
        { action: "move", session_id: "a", day_hint: 4, day_slot: "am", reason: "x" },
        { action: "move", session_id: "a", day_hint: 2, reason: "x" },
        { action: "move", session_id: "a", day_hint: 6, reason: "x" },
        { action: "move", session_id: "a", day_hint: 5, reason: "rest before" },
      ],
      ctx(c),
    );
    expect(rejected.map((r) => r.rule)).toEqual(["invalid_day", "no_change", "in_the_past", "target_slot_locked"]);
    expect(accepted[0].change).toBe('Thu AM → Fri AM (swaps with "Easy run")');
  });

  it("keeps one suggestion per session and caps the total", () => {
    const many = Array.from({ length: 6 }, (_, i) => cand({ id: `s${i}`, day_hint: 4 + (i % 3) }));
    const proposals = [
      { action: "easier", session_id: "s0", reason: "x" },
      { action: "skip", session_id: "s0", reason: "x" },
      ...many.slice(1).map((m) => ({ action: "easier", session_id: m.id, reason: "x" })),
    ];
    const { accepted, rejected } = validateSuggestions(proposals, ctx(many));
    expect(accepted).toHaveLength(AI_MAX_SUGGESTIONS);
    expect(rejected.map((r) => r.rule)).toContain("duplicate_session");
    expect(rejected.map((r) => r.rule)).toContain("over_limit");
  });

  it("tolerates garbage input", () => {
    expect(validateSuggestions("not a list", ctx([cand()]))).toEqual({ accepted: [], rejected: [] });
    expect(validateSuggestions([null, 3, "x"], ctx([cand()])).accepted).toEqual([]);
  });
});
