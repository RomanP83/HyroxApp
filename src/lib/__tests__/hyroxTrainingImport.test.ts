import { describe, it, expect } from "vitest";
import { mapHyroxTraining, secs, slimBackup, unwrapBackup } from "../import/hyroxTraining";
import { weeklyHistory } from "@/components/ImportedHistory";

const legs = (run: string, station: string) =>
  Array.from({ length: 8 }, () => ({ runTime: run, stationTime: station, runRpe: "7", station: "ski" }));

const backup = {
  format: "hyrox-verona-tracker",
  exportedAt: "2026-11-01T10:00:00Z",
  data: {
    version: 3,
    plans: {},
    targets: {},
    workouts: [
      { id: "w1", date: "2026-10-05", kind: "Running", title: "Easy Run · Zone 2", completed: true, duration: "45", sessionRpe: "4", distance: "8,5", notes: "gut", exercises: [{ sets: [1, 2, 3] }] },
      { id: "w2", date: "2026-10-06", kind: "Strength A", title: "Strength A", completed: false, duration: "60" },
      { id: "w3", date: "2026-10-10", kind: "Simulation", title: "Sim Oktober", completed: true, duration: "80", raceLegs: legs("4:10", "4:30"), roxTime: "5:30" },
      { id: "w4", date: "2026-10-17", kind: "Simulation", completed: true, raceLegs: legs("4:10", "") },
      { id: "w5", date: "2026-10-24", kind: "Simulation", completed: true, raceLegs: legs("4:00", "4:20"), roxIncluded: true },
      { id: "w6", date: "bad", kind: "Running", completed: true },
    ],
    records: [
      { id: "r1", metric: "ski", date: "2026-10-01", time: "4:05" },
      { id: "r2", metric: "wall", date: "2026-10-02", time: "5:20", context: "sequence" },
      { id: "r3", metric: "wall", date: "2026-10-03", time: "4:50", context: "fresh" },
      { id: "r4", metric: "run", date: "2026-10-04", time: "34:00" },
      { id: "r5", metric: "pull", date: "2026-10-05", time: "" },
    ],
  },
};

describe("secs", () => {
  it("reads the tracker's clock formats", () => {
    expect(secs("4:30")).toBe(270);
    expect(secs("1:24:55")).toBe(5095);
    expect(secs(95)).toBe(95);
    expect(secs("")).toBeNull();
    expect(secs("abc")).toBeNull();
    expect(secs(0)).toBeNull();
  });
});

describe("mapHyroxTraining", () => {
  const plan = mapHyroxTraining(backup);

  it("takes finished workouts only, with clean numbers", () => {
    expect(plan.workouts.map((w) => w.source_id)).toEqual(["w1", "w3", "w4", "w5"]);
    expect(plan.workouts[0]).toMatchObject({
      source: "hyroxtraining",
      done_on: "2026-10-05",
      kind: "Running",
      duration_min: 45,
      rpe: 4,
      distance_km: 8.5,
      notes: "gut",
    });
    expect(plan.skipped.workout_without_id_date_or_kind).toBe(1);
  });

  it("turns fully split simulations into race results", () => {
    expect(plan.races.map((r) => r.source_id)).toEqual(["w3", "w5"]);
    const oct = plan.races[0];
    expect(oct.runs_sec).toEqual(Array(8).fill(250));
    expect(oct.stations_sec).toEqual(Array(8).fill(270));
    expect(oct.roxzone_sec).toBe(330);
    expect(oct.total_sec).toBe(8 * 250 + 8 * 270 + 330);
    // Roxzone counted inside the runs: no separate roxzone, total is the sum.
    expect(plan.races[1].roxzone_sec).toBeNull();
    expect(plan.races[1].total_sec).toBe(8 * 240 + 8 * 260);
    expect(plan.skipped.simulation_without_all_splits).toBe(1);
  });

  it("maps station records to benchmarks, wall balls only after a sequence", () => {
    expect(plan.benchmarks.map((b) => [b.slug, b.value])).toEqual([
      ["station_ski_1000", 245],
      ["station_wallballs_100", 320],
    ]);
    expect(plan.skipped).toMatchObject({
      wall_balls_not_after_a_sequence: 1,
      record_not_a_station_benchmark: 1,
      record_without_id_date_or_time: 1,
    });
  });

  it("is the same through the slimmed copy the browser sends", () => {
    expect(mapHyroxTraining(slimBackup(backup))).toEqual(plan);
    expect(JSON.stringify(slimBackup(backup))).not.toContain("exercises");
  });

  it("accepts the bare data object and refuses anything else", () => {
    expect(mapHyroxTraining(backup.data)).toEqual(plan);
    expect(() => unwrapBackup({ hello: 1 })).toThrow("not_a_tracker_backup");
    expect(() => mapHyroxTraining(null)).toThrow();
  });
});

describe("weeklyHistory", () => {
  it("buckets by Monday", () => {
    const { sessions, hours } = weeklyHistory([
      { done_on: "2026-10-05", kind: "Running", duration_min: 60 }, // Mon
      { done_on: "2026-10-11", kind: "Running", duration_min: 30 }, // Sun, same week
      { done_on: "2026-10-12", kind: "Running", duration_min: null }, // next Mon
    ]);
    expect(sessions).toEqual([
      { label: "10-05", y: 2 },
      { label: "10-12", y: 1 },
    ]);
    expect(hours[0].y).toBe(1.5);
  });
});
