import { describe, it, expect } from "vitest";
import {
  microCalibrate,
  macroGuardrails,
  computeLoadState,
  type LoadEntry,
  type MicroInput,
} from "../adaptive";
import { initialAthleteState } from "../index";
import type { AthleteProfile, AthleteState } from "../types";

function profile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    id: "p1",
    division: "open",
    experience_level: "intermediate",
    five_k_seconds: 1350,
    station_estimates: {},
    training_days_per_week: 4,
    equipment_access: "full_gym",
    ...overrides,
  };
}

const p = profile();

describe("computeLoadState (ACWR)", () => {
  it("computes acute/chronic/acwr from sRPE history", () => {
    const now = new Date("2026-07-04T12:00:00Z");
    const history: LoadEntry[] = [];
    // 28 days of steady 300 sRPE/day => acute 7d ~2100, chronic weekly ~2100, acwr ~1.
    for (let d = 0; d < 28; d++) {
      history.push({ at: new Date(now.getTime() - d * 86_400_000), srpe: 300 });
    }
    const s = computeLoadState(history, now);
    expect(s.acute_load_7d).toBe(2100);
    expect(s.chronic_load_28d).toBe(2100);
    expect(s.acwr).toBeCloseTo(1.0, 1);
  });

  it("flags a spike as high ACWR", () => {
    const now = new Date("2026-07-04T12:00:00Z");
    const history: LoadEntry[] = [];
    for (let d = 7; d < 28; d++) history.push({ at: new Date(now.getTime() - d * 86_400_000), srpe: 100 });
    for (let d = 0; d < 7; d++) history.push({ at: new Date(now.getTime() - d * 86_400_000), srpe: 500 });
    const s = computeLoadState(history, now);
    expect(s.acwr).toBeGreaterThan(1.3);
  });
});

describe("micro-calibration — step rules", () => {
  function base(): AthleteState {
    return initialAthleteState(p);
  }

  it("steps a station tier UP only after two consecutive too-easy sessions", () => {
    const state = base();
    const startTier = state.station_tiers.wall_balls;
    // First easy session (delta -2) but no prior streak: no tier change.
    const first = microCalibrate({
      state, profile: p, sessionType: "station_work", station: "wall_balls",
      rpeTarget: 8, rpeActual: 6, durationActualMin: 50, loadHistory: [{ at: new Date(), srpe: 300 }],
    } as MicroInput);
    expect(first.state.station_tiers.wall_balls).toBe(startTier);

    // Second easy session with previousSameTypeDelta = -2: step up one.
    const second = microCalibrate({
      state: first.state, profile: p, sessionType: "station_work", station: "wall_balls",
      rpeTarget: 8, rpeActual: 6, previousSameTypeDelta: -2, durationActualMin: 50,
      loadHistory: [{ at: new Date(), srpe: 300 }],
    } as MicroInput);
    expect(second.state.station_tiers.wall_balls).toBe(startTier + 1);
    expect(second.adjustments.some((a) => a.action_taken.type === "tier_up")).toBe(true);
  });

  it("steps DOWN immediately when a session is too hard", () => {
    const state = base();
    const start = state.station_tiers.ski_erg;
    const res = microCalibrate({
      state, profile: p, sessionType: "station_work", station: "ski_erg",
      rpeTarget: 6, rpeActual: 9, durationActualMin: 50, loadHistory: [{ at: new Date(), srpe: 450 }],
    } as MicroInput);
    expect(res.state.station_tiers.ski_erg).toBe(Math.max(1, start - 1));
  });

  it("station calibration is station-specific (only the logged station moves)", () => {
    const state = base();
    const res = microCalibrate({
      state, profile: p, sessionType: "station_work", station: "wall_balls",
      rpeTarget: 8, rpeActual: 6, previousSameTypeDelta: -2, durationActualMin: 50,
      loadHistory: [{ at: new Date(), srpe: 300 }],
    } as MicroInput);
    expect(res.state.station_tiers.wall_balls).not.toBe(state.station_tiers.wall_balls);
    expect(res.state.station_tiers.ski_erg).toBe(state.station_tiers.ski_erg);
    expect(res.state.station_tiers.sled_push).toBe(state.station_tiers.sled_push);
  });

  it("never moves a pace zone more than 3% in one step (no runaway)", () => {
    const state = base();
    const from = state.pace_zones.easy_sec_km;
    const res = microCalibrate({
      state, profile: p, sessionType: "run_easy",
      rpeTarget: 5, rpeActual: 5, durationActualMin: 45,
      actualPaceSecKm: from - 120, // a wild outlier 2 min/km faster
      loadHistory: [{ at: new Date(), srpe: 225 }],
    } as MicroInput);
    const changePct = Math.abs(res.state.pace_zones.easy_sec_km - from) / from;
    expect(changePct).toBeLessThanOrEqual(0.031);
  });

  it("caps tiers within 1..3", () => {
    let state = base();
    state = { ...state, station_tiers: { ...state.station_tiers, wall_balls: 3 } };
    const res = microCalibrate({
      state, profile: p, sessionType: "station_work", station: "wall_balls",
      rpeTarget: 8, rpeActual: 6, previousSameTypeDelta: -2, durationActualMin: 50,
      loadHistory: [{ at: new Date(), srpe: 300 }],
    } as MicroInput);
    expect(res.state.station_tiers.wall_balls).toBe(3); // cannot exceed 3
  });
});

// ── 10 synthetic athlete trajectories (Implementation Plan §6, week 11–12) ──
type Archetype = "consistent" | "chaotic" | "overloaded" | "pause";

function runTrajectory(kind: Archetype, weeks = 8): { state: AthleteState; tierHistory: number[] } {
  let state = initialAthleteState(p);
  const history: LoadEntry[] = [];
  const tierHistory: number[] = [];
  let prevDelta = 0;
  const now = new Date("2026-07-04T12:00:00Z");

  for (let d = 0; d < weeks * 4; d++) {
    const at = new Date(now.getTime() - (weeks * 4 - d) * 86_400_000);
    let rpeActual: number;
    const rpeTarget = 7;
    switch (kind) {
      case "consistent": rpeActual = 7; break;
      case "chaotic": rpeActual = [3, 9, 5, 8, 4, 10, 6][d % 7]; break;
      case "overloaded": rpeActual = 9; break;
      case "pause": rpeActual = d < 4 ? 7 : 8; break;
    }
    const srpe = rpeActual * 50;
    history.push({ at, srpe });
    const res = microCalibrate({
      state, profile: p, sessionType: "station_work", station: "wall_balls",
      rpeTarget, rpeActual, previousSameTypeDelta: prevDelta, durationActualMin: 50,
      loadHistory: history, now: at,
    } as MicroInput);
    state = res.state;
    prevDelta = rpeActual - rpeTarget;
    tierHistory.push(state.station_tiers.wall_balls);
  }
  return { state, tierHistory };
}

describe("adaptive simulations — no oscillation, sane end states", () => {
  it("consistent athlete: tier stays within [1,3] and never oscillates >1 step/log", () => {
    const { tierHistory } = runTrajectory("consistent");
    for (let i = 1; i < tierHistory.length; i++) {
      expect(Math.abs(tierHistory[i] - tierHistory[i - 1])).toBeLessThanOrEqual(1);
      expect(tierHistory[i]).toBeGreaterThanOrEqual(1);
      expect(tierHistory[i]).toBeLessThanOrEqual(3);
    }
  });

  it("chaotic athlete: bounded, never leaves [1,3], no >1 step jumps", () => {
    const { tierHistory } = runTrajectory("chaotic");
    for (let i = 1; i < tierHistory.length; i++) {
      expect(Math.abs(tierHistory[i] - tierHistory[i - 1])).toBeLessThanOrEqual(1);
    }
    expect(Math.min(...tierHistory)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...tierHistory)).toBeLessThanOrEqual(3);
  });

  it("overloaded athlete: tier trends DOWN, macro triggers an auto-deload", () => {
    const { state, tierHistory } = runTrajectory("overloaded");
    expect(tierHistory[tierHistory.length - 1]).toBeLessThanOrEqual(tierHistory[0]);
    const macro = macroGuardrails({
      state, avgRpe14d: 9, daysSinceLastSession: 1, injuryFlag: false, planStatus: "active",
    });
    expect(macro.directives.some((d) => d.type === "auto_deload")).toBe(true);
  });

  it("pause archetype triggers a rebase directive after >=7 inactive days", () => {
    const { state } = runTrajectory("pause");
    const macro = macroGuardrails({
      state, avgRpe14d: 7, daysSinceLastSession: 9, injuryFlag: false, planStatus: "active",
    });
    expect(macro.directives.some((d) => d.type === "rebase")).toBe(true);
  });
});

describe("macro-guardrails precedence", () => {
  const state = initialAthleteState(p);
  it("injury flag wins over everything", () => {
    const r = macroGuardrails({ state, avgRpe14d: 9, daysSinceLastSession: 30, injuryFlag: true, planStatus: "active" });
    expect(r.directives[0].type).toBe("rehab");
  });
  it("soft ACWR trims the week", () => {
    const hot = { ...state, acwr: 1.4 };
    const r = macroGuardrails({ state: hot, avgRpe14d: 7, daysSinceLastSession: 1, injuryFlag: false, planStatus: "active" });
    expect(r.directives.some((d) => d.type === "trim_week")).toBe(true);
  });
  it("low ACWR after a gap eases back in", () => {
    const cold = { ...state, acwr: 0.6 };
    const r = macroGuardrails({ state: cold, avgRpe14d: 5, daysSinceLastSession: 4, injuryFlag: false, planStatus: "active" });
    expect(r.directives.some((d) => d.type === "ramp_up")).toBe(true);
  });
  it("every macro action carries a user-facing reason (PP1)", () => {
    const hot = { ...state, acwr: 1.6 };
    const r = macroGuardrails({ state: hot, avgRpe14d: 8, daysSinceLastSession: 1, injuryFlag: false, planStatus: "active" });
    expect(r.adjustments.every((a) => a.reason.length > 10)).toBe(true);
  });
});
