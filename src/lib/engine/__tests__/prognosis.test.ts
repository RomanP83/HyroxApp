// ============================================================================
// The finish-time estimate, and the one property that matters most about it:
// it has to agree with its own decomposition. /race pre-fills the goal field
// with this number and then lays it out segment by segment — if the two run on
// different models, the athlete is told they are minutes off a pace that was
// never asked of them.
// ============================================================================
import { describe, expect, it } from "vitest";
import { goalCheck, predictRaceTime } from "../prognosis";
import { pacingPlan, roxzoneSeconds, stationSeconds, STATION_ORDER } from "../raceModel";
import { defaultPaceZones, defaultStationTiers } from "../constants";
import type { AthleteProfile, AthleteState, Division, ExperienceLevel, Station } from "../types";

const athlete = (over: {
  goal?: number;
  division?: Division;
  level?: ExperienceLevel;
  fiveK?: number;
  tiers?: Record<string, number>;
  measured?: Partial<Record<Station, number>>;
} = {}) => {
  const level = over.level ?? "intermediate";
  const zones = defaultPaceZones(over.fiveK ?? 1290); // 21:30 5k -> 4:23/km race
  const profile = {
    division: over.division ?? "open",
    experience_level: level,
    goal_race_time_sec: over.goal ?? null,
  } as AthleteProfile;
  const state = {
    pace_zones: zones,
    station_tiers: over.tiers ?? defaultStationTiers(level),
    measured_station_seconds: over.measured,
  } as AthleteState;
  return { profile, state, zones };
};

describe("the finish-time estimate", () => {
  it("agrees with the sheet even once the benchmarks have had their say", () => {
    // The corrections used to live only inside the estimate. The sheet then
    // decomposed a number built with them using station totals built without
    // them, and reported the difference to the athlete as a gap to close —
    // 96 seconds of it for a good 1 km time trial.
    const { profile, state, zones } = athlete();
    for (const benchmarks of [
      [{ slug: "run_1k", value: 200 }],
      [{ slug: "wall_balls", value: 90 }],
      [{ slug: "run_1k", value: 260 }, { slug: "wall_balls", value: 40 }],
    ]) {
      const predicted = predictRaceTime(profile, state, benchmarks);
      const sheet = pacingPlan({
        division: "open",
        level: "intermediate",
        goalSeconds: predicted,
        tiers: state.station_tiers,
        paceZones: zones,
        benchmarks,
      });
      expect(sheet.gap_seconds).toBe(0);
    }
  });

  it("agrees with the pacing sheet it gets decomposed into", () => {
    // The regression this file exists for. v1 predicted 1:05 for an athlete
    // whose race pace was 4:23/km; the pacing sheet then demanded 3:16/km to
    // reach it. Feeding the estimate back in must now ask for exactly the pace
    // it was built from.
    for (const division of ["open", "pro", "masters_open", "doubles"] as const) {
      for (const level of ["beginner", "intermediate", "advanced", "elite"] as const) {
        const { profile, state, zones } = athlete({ division, level });
        const predicted = predictRaceTime(profile, state, []);
        const sheet = pacingPlan({
          division,
          level,
          goalSeconds: predicted,
          tiers: state.station_tiers,
          paceZones: zones,
        });
        // Within a second: the sheet rounds the pace, the estimate does not.
        expect(Math.abs(sheet.required_pace_sec_km - zones.race_sec_km)).toBeLessThanOrEqual(1);
        expect(sheet.gap_seconds).toBe(0);
        expect(sheet.impossible).toBe(false);
      }
    }
  });

  it("is the sum of the running, the stations and the roxzone", () => {
    const { profile, state, zones } = athlete();
    const stations = STATION_ORDER.reduce(
      (n, s) => n + stationSeconds(s, "open", state.station_tiers[s] ?? 2),
      0,
    );
    const expected = zones.race_sec_km * 8 + stations + roxzoneSeconds("intermediate");
    expect(predictRaceTime(profile, state, [])).toBe(Math.round(expected));
  });

  it("lands a mid-pack open athlete in the range mid-pack open athletes finish in", () => {
    // 21:30 over 5 km is an ordinary club runner; Hyrox Open sits near 1:30
    // and this athlete should be inside the field, not winning it.
    const { profile, state } = athlete();
    const predicted = predictRaceTime(profile, state, []);
    expect(predicted).toBeGreaterThan(65 * 60);
    expect(predicted).toBeLessThan(85 * 60);
  });

  it("makes the pro loads cost real minutes, not seconds", () => {
    // The same athlete, the same legs, the heavier sled: the two divisions must
    // not come out within a minute of each other.
    const open = athlete({ division: "open" });
    const pro = athlete({ division: "pro" });
    const gap =
      predictRaceTime(pro.profile, pro.state, []) - predictRaceTime(open.profile, open.state, []);
    expect(gap).toBeGreaterThan(3 * 60);
    expect(gap).toBeLessThan(10 * 60);
  });

  it("gets faster as the stations get better", () => {
    const even = (tier: number) => Object.fromEntries(STATION_ORDER.map((s) => [s, tier]));
    const weak = athlete({ tiers: even(1) });
    const strong = athlete({ tiers: even(3) });
    expect(predictRaceTime(strong.profile, strong.state, [])).toBeLessThan(
      predictRaceTime(weak.profile, weak.state, []),
    );
  });

  it("gets faster as the roxzone shortens with experience", () => {
    // Same legs, same stations — only the walking between them differs.
    const tiers = Object.fromEntries(STATION_ORDER.map((s) => [s, 2]));
    const slow = athlete({ level: "beginner", tiers });
    const quick = athlete({ level: "elite", tiers });
    const saved =
      predictRaceTime(slow.profile, slow.state, []) - predictRaceTime(quick.profile, quick.state, []);
    expect(saved).toBe(roxzoneSeconds("beginner") - roxzoneSeconds("elite"));
  });

  it("uses a measured race split over the tier that stands in for it", () => {
    const estimated = athlete();
    const base = predictRaceTime(estimated.profile, estimated.state, []);
    // A wall-ball set that actually took ten minutes.
    const measured = athlete({ measured: { wall_balls: 600 } });
    const withMeasured = predictRaceTime(measured.profile, measured.state, []);
    expect(withMeasured).toBeGreaterThan(base);
    expect(withMeasured - base).toBe(600 - stationSeconds("wall_balls", "open", 2));
  });
});

describe("what the benchmarks are allowed to move", () => {
  it("lets a strong wall-ball score pull the wall-ball station down", () => {
    const { profile, state } = athlete();
    const base = predictRaceTime(profile, state, []);
    const strong = predictRaceTime(profile, state, [{ slug: "wall_balls", value: 90 }]);
    const weak = predictRaceTime(profile, state, [{ slug: "wall_balls", value: 40 }]);
    expect(strong).toBeLessThan(base);
    expect(weak).toBeGreaterThan(base);
  });

  it("does not let a gym test overrule a station the race already measured", () => {
    const { profile, state } = athlete({ measured: { wall_balls: 420 } });
    const base = predictRaceTime(profile, state, []);
    expect(predictRaceTime(profile, state, [{ slug: "wall_balls", value: 90 }])).toBe(base);
  });

  it("lets a fast 1 km lean on the race-pace assumption without replacing it", () => {
    const { profile, state, zones } = athlete();
    const base = predictRaceTime(profile, state, []);
    // A time trial implying a race pace well under the calibrated zone.
    const fast = predictRaceTime(profile, state, [{ slug: "run_1k", value: 200 }]);
    expect(fast).toBeLessThan(base);
    // Only partly trusted: it must not move the estimate the full distance.
    const implied = 200 * 1.12;
    const full = (zones.race_sec_km - implied) * 8;
    expect(base - fast).toBeLessThan(full);
  });
});

describe("am I on course", () => {
  it("says nothing at all until a goal has been set", () => {
    const { profile, state } = athlete();
    expect(goalCheck({ profile, state })).toBeNull();
  });

  it("calls a goal the athlete is already inside on course", () => {
    // 1:30 for someone the model puts at about 1:14.
    const { profile, state } = athlete({ goal: 90 * 60 });
    const check = goalCheck({ profile, state })!;
    expect(check.on_course).toBe(true);
    expect(check.delta_seconds).toBeLessThan(0);
    expect(check.station_gap_seconds).toBe(0);
    expect(check.running_gap_seconds).toBe(0);
  });

  it("splits a shortfall into what the stations can give and what the legs must", () => {
    const { profile, state } = athlete({ goal: 70 * 60 });
    const check = goalCheck({ profile, state })!;
    expect(check.on_course).toBe(false);
    expect(check.delta_seconds).toBeGreaterThan(0);
    // The two halves account for the whole shortfall, and neither invents time.
    expect(check.station_gap_seconds + check.running_gap_seconds).toBe(check.delta_seconds);
    expect(check.station_gap_seconds).toBeGreaterThan(0);
  });

  it("never promises more from the stations than the stations have", () => {
    // A goal far out of reach: the stations can only ever give what they cost.
    const { profile, state } = athlete({ goal: 45 * 60 });
    const check = goalCheck({ profile, state })!;
    const available = check.worst.reduce((n, w) => n + w.cost_seconds, 0);
    expect(check.station_gap_seconds).toBeGreaterThanOrEqual(available);
    expect(check.running_gap_seconds).toBeGreaterThan(0);
  });

  it("names the stations holding the time, worst first", () => {
    const { profile, state } = athlete({ goal: 70 * 60 });
    const worst = goalCheck({ profile, state })!.worst;
    expect(worst.length).toBeGreaterThan(0);
    expect(worst.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < worst.length; i++) {
      expect(worst[i - 1].cost_seconds).toBeGreaterThanOrEqual(worst[i].cost_seconds);
    }
  });

  it("makes an unrealistic goal legible as a pace rather than a verdict", () => {
    // Sub-50 with every station already perfect still needs the legs to do
    // something nobody does. The number says so without anyone editorialising.
    const { profile, state } = athlete({ goal: 50 * 60 });
    const check = goalCheck({ profile, state })!;
    expect(check.out_of_reach).toBe(false); // arithmetically there is room
    expect(check.required_pace_after_stations_sec_km).toBeLessThan(150); // under 2:30/km
    expect(check.required_pace_after_stations_sec_km).toBeGreaterThan(0);
  });

  it("flags a goal the stations alone already exceed", () => {
    const { profile, state } = athlete({ goal: 25 * 60 });
    const check = goalCheck({ profile, state })!;
    expect(check.out_of_reach).toBe(true);
    expect(check.required_pace_after_stations_sec_km).toBe(0);
  });
});
