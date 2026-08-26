import { describe, it, expect } from "vitest";
import {
  applyRunFrequency,
  assessVolumeTarget,
  defaultPaceZones,
  distributeSlots,
  generatePlan,
  initialAthleteState,
  isRunSession,
  scaleRunDurations,
  VOLUME_CURVE_BY_PHASE,
  weeklyRunSummary,
  weeklyVolumeTarget,
  type AthleteProfile,
} from "../index";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";
import { loggedDistanceKm } from "@/lib/runVolume";

const ZONES = defaultPaceZones(1350);
const profile = (over: Partial<AthleteProfile> = {}): AthleteProfile => ({
  id: "t",
  division: "open",
  experience_level: "intermediate",
  five_k_seconds: 1350,
  station_estimates: {},
  training_days_per_week: 5,
  equipment_access: "full_gym",
  ...over,
});

describe("weeklyVolumeTarget", () => {
  it("peaks in the base block and falls the whole way to the race", () => {
    // Distance early, specificity late. What rises towards the race is the
    // compromised running and the station work the mix hands over to (30%
    // running in an elite peak against 55% in its base) — mileage held up on
    // top of that is the base giving way before the fitness arrives.
    const curve = VOLUME_CURVE_BY_PHASE;
    expect(curve.base).toBe(1);
    expect(curve.build).toBeLessThan(curve.base);
    expect(curve.peak).toBeLessThan(curve.build);
    expect(curve.taper).toBeLessThan(curve.peak);
    expect(weeklyVolumeTarget({ peakKm: 50, phase: "base", isDeload: false })).toBe(50);
  });

  it("lands a 50 km cycle where the prescription puts it", () => {
    // base 40-50, build 35-45, peak 30-40, taper 15-22 for a peak week of 50.
    const km = (phase: "base" | "build" | "peak" | "taper") =>
      weeklyVolumeTarget({ peakKm: 50, phase, isDeload: false });
    expect(km("base")).toBe(50);
    expect(km("build")).toBe(45);
    expect(km("peak")).toBe(40);
    expect(km("taper")).toBe(20);
  });

  it("ramps into the first weeks instead of starting at full volume", () => {
    const w1 = weeklyVolumeTarget({ peakKm: 50, phase: "base", isDeload: false, weekNumber: 1 });
    const w3 = weeklyVolumeTarget({ peakKm: 50, phase: "base", isDeload: false, weekNumber: 3 });
    const w6 = weeklyVolumeTarget({ peakKm: 50, phase: "base", isDeload: false, weekNumber: 6 });
    expect(w1).toBeLessThan(w3);
    expect(w3).toBeLessThanOrEqual(w6);
    expect(w6).toBe(50 * VOLUME_CURVE_BY_PHASE.base);
  });

  it("takes a deload week down", () => {
    const normal = weeklyVolumeTarget({ peakKm: 50, phase: "build", isDeload: false });
    const deload = weeklyVolumeTarget({ peakKm: 50, phase: "build", isDeload: true });
    expect(deload).toBeLessThan(normal);
  });
});

describe("scaleRunDurations", () => {
  const slots = distributeSlots({
    phase: "build",
    trainingDays: 5,
    weekInPhase: 1,
    isDeload: false,
    isBenchmark: false,
  });

  it("lands the week on its target", () => {
    for (const target of [25, 35, 45]) {
      const scaled = scaleRunDurations(slots, ZONES, target);
      const km = weeklyRunSummary(scaled, ZONES).total_km;
      expect(Math.abs(km - target), `target ${target} → ${km}`).toBeLessThan(target * 0.15);
    }
  });

  it("gets as close as the session mix allows, rather than inventing volume", () => {
    // Three runs cannot carry 60 km without absurd sessions; the caps hold and
    // the week ends up under the target instead of over it.
    const scaled = scaleRunDurations(slots, ZONES, 60);
    const km = weeklyRunSummary(scaled, ZONES).total_km;
    const before = weeklyRunSummary(slots, ZONES).total_km;
    expect(km).toBeGreaterThan(before);
    expect(km).toBeLessThan(60);
  });

  it("keeps the long run the long one and leaves other sessions alone", () => {
    const scaled = scaleRunDurations(slots, ZONES, 60);
    const long = scaled.find((s) => s.session_type === "long_run")!;
    const easy = scaled.find((s) => s.session_type === "run_easy");
    if (easy) expect(long.planned_duration_min).toBeGreaterThan(easy.planned_duration_min);
    const strengthBefore = slots.find((s) => s.session_type === "strength")!;
    const strengthAfter = scaled.find((s) => s.session_type === "strength")!;
    expect(strengthAfter.planned_duration_min).toBe(strengthBefore.planned_duration_min);
  });

  it("refuses to turn a recovery run into an epic, whatever the target", () => {
    const scaled = scaleRunDurations(slots, ZONES, 150);
    for (const slot of scaled) {
      if (slot.session_type === "run_easy") expect(slot.planned_duration_min).toBeLessThanOrEqual(60);
      if (slot.session_type === "long_run") expect(slot.planned_duration_min).toBeLessThanOrEqual(150);
    }
  });
});

describe("applyRunFrequency", () => {
  it("adds runs up to the requested number", () => {
    const types = ["compromised_run", "run_intervals", "strength", "station_work", "mobility"] as const;
    const out = applyRunFrequency([...types], "build", 4);
    expect(out.filter(isRunSession)).toHaveLength(4);
  });

  it("always leaves one session for strength or stations", () => {
    const types = ["compromised_run", "run_intervals", "strength", "station_work"] as const;
    const out = applyRunFrequency([...types], "build", 6);
    expect(out.filter((t) => !isRunSession(t)).length).toBeGreaterThanOrEqual(1);
  });

  it("drops the phase's lowest-priority run first — never the long run", () => {
    const types = ["compromised_run", "run_intervals", "long_run", "strength", "run_easy"] as const;
    const out = applyRunFrequency([...types], "build", 3);
    expect(out.filter(isRunSession)).toHaveLength(3);
    expect(out).toContain("long_run");
    expect(out).not.toContain("run_easy");
  });

  it("does nothing without a request", () => {
    const types = ["long_run", "strength", "run_intervals"] as const;
    expect(applyRunFrequency([...types], "base")).toEqual(types);
  });
});

describe("a plan built to a volume target", () => {
  const p = profile({ weekly_km_peak: 45, runs_per_week: 4 });
  const state = initialAthleteState(p);
  const plan = generatePlan({ profile: p, state, library: DEMO_LIBRARY, weeksToRace: 12 });
  const weeks = plan.phases.flatMap((ph) => ph.weeks.map((w) => ({ phase: ph.phase_type, w })));

  it("never exceeds the peak the athlete asked for", () => {
    for (const { phase, w } of weeks) {
      const km = weeklyRunSummary(w.sessions, state.pace_zones, phase).total_km;
      expect(km, `week ${w.week_number}`).toBeLessThanOrEqual(45 * 1.1);
    }
  });

  it("hits the peak somewhere in the build block", () => {
    const build = weeks.filter((x) => x.phase === "build" && !x.w.is_deload);
    const best = Math.max(
      ...build.map((x) => weeklyRunSummary(x.w.sessions, state.pace_zones, "build").total_km),
    );
    expect(best).toBeGreaterThan(45 * 0.9);
  });

  it("runs the requested number of sessions in a full week", () => {
    const build = weeks.find((x) => x.phase === "build" && !x.w.is_deload)!;
    expect(weeklyRunSummary(build.w.sessions, state.pace_zones, "build").runs).toBe(4);
  });

  it("leaves plans without a target exactly as they were", () => {
    const auto = profile();
    const autoState = initialAthleteState(auto);
    const autoPlan = generatePlan({ profile: auto, state: autoState, library: DEMO_LIBRARY, weeksToRace: 12 });
    const first = autoPlan.phases[0].weeks[0].sessions.find((s) => s.session_type === "long_run")!;
    expect(first.planned_duration_min).toBe(80); // the prescription's base duration
  });
});

describe("assessVolumeTarget", () => {
  it("accepts a target the recent weeks support", () => {
    const a = assessVolumeTarget({ targetKm: 45, recentWeeklyKm: [34, 32, 30, 33], weeksToPeak: 6 });
    expect(a.verdict).toBe("ok");
    expect(a.recent_weekly_km).toBeCloseTo(32.3, 1);
  });

  it("calls out a ramp the last four weeks do not support", () => {
    const a = assessVolumeTarget({ targetKm: 70, recentWeeklyKm: [20, 18, 22, 19], weeksToPeak: 4 });
    expect(a.verdict).toBe("steep");
    expect(a.safe_peak_km).toBeLessThan(70);
    expect(a.note).toContain("steeper");
  });

  it("caps the whole cycle's growth, not just the weekly step", () => {
    const a = assessVolumeTarget({ targetKm: 100, recentWeeklyKm: [30, 30, 30, 30], weeksToPeak: 40 });
    expect(a.safe_peak_km).toBe(48); // 30 × 1.6, not 30 × 1.1^40
  });

  it("says it cannot judge yet instead of guessing", () => {
    const a = assessVolumeTarget({ targetKm: 50, recentWeeklyKm: [], weeksToPeak: 6 });
    expect(a.verdict).toBe("unknown");
    expect(a.safe_peak_km).toBeNull();
  });
});

describe("loggedDistanceKm", () => {
  it("prefers what the watch measured", () => {
    const km = loggedDistanceKm("run_easy", 40, [{ distance_actual_m: 8200 }], ZONES);
    expect(km).toBe(8.2);
  });

  it("falls back to minutes at the session's pace zone", () => {
    expect(loggedDistanceKm("run_easy", 40, null, ZONES)).toBeGreaterThan(5);
    expect(loggedDistanceKm("strength", 60, null, ZONES)).toBe(0);
  });
});

describe("the volume a generated cycle actually carries", () => {
  // The curve is a target; what the athlete sees is the sum of the sessions
  // after they have been scaled and clamped to their own bounds. This is the
  // test that says the two agree — a curve nobody's week follows is a comment.
  const profile = (over: Partial<AthleteProfile> = {}): AthleteProfile => ({
    id: "t",
    division: "pro",
    experience_level: "world_class",
    five_k_seconds: 1140, // 19:00 — 3:48 / km
    station_estimates: {},
    training_days_per_week: 6,
    doubles_per_week: 2,
    equipment_access: "full_gym",
    weekly_km_peak: 50,
    ...over,
  });

  function weeks(over: Partial<AthleteProfile> = {}) {
    const p = profile(over);
    const state = initialAthleteState(p);
    const plan = generatePlan({ profile: p, state, library: DEMO_LIBRARY, weeksToRace: 12 });
    return plan.phases.flatMap((ph) =>
      ph.weeks.map((w) => ({
        phase: ph.phase_type,
        week: w.week_number,
        isDeload: w.is_deload,
        km: weeklyRunSummary(w.sessions, state.pace_zones, ph.phase_type).total_km,
      })),
    );
  }

  it("tracks its own target week by week", () => {
    for (const w of weeks()) {
      const target = weeklyVolumeTarget({
        peakKm: 50,
        phase: w.phase,
        isDeload: w.isDeload,
        weekNumber: w.week,
      });
      // Within 15%: sessions have their own floors and ceilings, and a
      // benchmark or a simulation displaces a run for the week it lands in.
      expect(
        Math.abs(w.km - target) / target,
        `W${w.week} ${w.phase}: ${w.km} km against a ${target} km target`,
      ).toBeLessThan(0.15);
    }
  });

  it("falls from the base block to the race rather than rising into it", () => {
    const rows = weeks();
    const best = (phase: string) => Math.max(...rows.filter((r) => r.phase === phase).map((r) => r.km));
    expect(best("base")).toBeGreaterThan(best("build"));
    expect(best("build")).toBeGreaterThan(best("peak"));
    expect(best("peak")).toBeGreaterThan(best("taper"));
  });

  it("puts a 19:00 five-k athlete at 35-50 km through the loading blocks", () => {
    // The bracket a sub-65 runner is aimed at: enough to hold race pace off
    // the stations, not so much that the stations pay for it.
    const loading = weeks().filter((w) => w.phase !== "taper" && !w.isDeload);
    for (const w of loading) {
      expect(w.km, `W${w.week} ${w.phase}`).toBeGreaterThanOrEqual(35);
      expect(w.km, `W${w.week} ${w.phase}`).toBeLessThanOrEqual(50);
    }
    const taper = weeks().find((w) => w.phase === "taper")!;
    expect(taper.km).toBeGreaterThanOrEqual(15);
    expect(taper.km).toBeLessThanOrEqual(23);
  });
});
