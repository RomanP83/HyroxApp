import { afterEach, describe, expect, it } from "vitest";
import {
  GarminImport,
  garminImportAuthed,
  mapPredictions,
  mapRuns,
  mapVo2,
  mondayOf,
  runDashboard,
  type StoredRun,
} from "@/lib/garminRuns";

const originalSecret = process.env.GARMIN_IMPORT_SECRET;
afterEach(() => {
  if (originalSecret == null) delete process.env.GARMIN_IMPORT_SECRET;
  else process.env.GARMIN_IMPORT_SECRET = originalSecret;
});

const req = (auth?: string) =>
  new Request("https://app.test/api/garmin/import", { method: "POST", headers: auth ? { authorization: auth } : {} });

describe("Garmin import auth", () => {
  it("fails closed without a configured secret", () => {
    delete process.env.GARMIN_IMPORT_SECRET;
    expect(garminImportAuthed(req("Bearer anything"))).toBe(false);
  });
  it("accepts the right bearer token and rejects others", () => {
    process.env.GARMIN_IMPORT_SECRET = "s3cret";
    expect(garminImportAuthed(req("Bearer s3cret"))).toBe(true);
    expect(garminImportAuthed(req("Bearer wrong!"))).toBe(false);
    expect(garminImportAuthed(req("s3cret"))).toBe(false);
    expect(garminImportAuthed(req())).toBe(false);
  });
});

// The connector's shapes, as they come.
const payload = GarminImport.parse({
  activities: [
    {
      id: 24999738660,
      name: "Laufbandtraining",
      type: "treadmill_running",
      event_type: "uncategorized",
      start_time: "2026-11-07 16:06:47",
      distance_meters: 14526.98046875,
      duration_seconds: 4217.0751953125,
      calories: 908.0,
      avg_hr_bpm: 144.0,
      max_hr_bpm: 156.0,
      steps: 11170,
    },
    { id: 2, name: "Ride", type: "cycling", start_time: "2026-11-06 10:00:00", distance_meters: 30000, duration_seconds: 3600 },
    { id: 3, name: "Too short", type: "running", start_time: "2026-11-05 10:00:00", distance_meters: 200, duration_seconds: 60 },
    { id: "4", name: "Laufband ", type: "running", start_time: "2026-11-02 18:48:25", distance_meters: 8000, duration_seconds: 2400 },
  ],
  vo2max: [
    { date: "2026-10-25", vo2_max: 56.4, source: "get_max_metrics" },
    { date: "2026-10-26", vo2_max: 56.4, carried_forward: true },
    { date: "2026-11-01", vo2_max: 56.5 },
  ],
  race_predictions: {
    prediction_date: "2026-11-07",
    predictions: {
      "5K": { time: "18:46", time_seconds: 1126 },
      "10K": { time: "39:41", time_seconds: 2381 },
      half_marathon: { time: "1:32:03", time_seconds: 5523 },
      marathon: { time: "3:32:35", time_seconds: 12755 },
    },
  },
});

describe("mapping the connector payload", () => {
  it("keeps runs only, with local wall time and trimmed names", () => {
    const { rows, skipped } = mapRuns(payload);
    expect(skipped).toBe(2);
    expect(rows.map((r) => r.activity_id)).toEqual([24999738660, 4]);
    expect(rows[0]).toMatchObject({
      start_local: "2026-11-07T16:06:47",
      duration_s: 4217,
      avg_hr: 144,
      activity_type: "treadmill_running",
    });
    expect(rows[1]).toMatchObject({ name: "Laufband", avg_hr: null });
  });

  it("stores measured VO2max days only", () => {
    expect(mapVo2(payload)).toEqual([
      { on_date: "2026-10-25", vo2max: 56.4 },
      { on_date: "2026-11-01", vo2max: 56.5 },
    ]);
  });

  it("maps race predictions to seconds", () => {
    expect(mapPredictions(payload)).toEqual({
      on_date: "2026-11-07",
      pred_5k_sec: 1126,
      pred_10k_sec: 2381,
      pred_half_sec: 5523,
      pred_marathon_sec: 12755,
    });
  });

  it("rejects a payload that is not the connector's shape", () => {
    expect(GarminImport.safeParse({ activities: [{ id: 1 }] }).success).toBe(false);
  });
});

describe("running dashboard", () => {
  const run = (day: string, km: number, paceSec: number, hr: number | null = null): StoredRun => ({
    activity_id: day + km,
    name: null,
    activity_type: "running",
    start_local: `${day}T08:00:00`,
    distance_m: km * 1000,
    duration_s: km * paceSec,
    avg_hr: hr,
  });

  it("buckets on a Monday grid", () => {
    expect(mondayOf("2026-11-08")).toBe("2026-11-02"); // Sunday
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
  });

  it("adds up weeks, pace, efficiency and the 4-week windows", () => {
    const runs = [
      // four weeks before the last four: 10 km/week at 6:00
      run("2026-09-08", 10, 360),
      run("2026-09-15", 10, 360),
      run("2026-09-22", 10, 360),
      run("2026-09-29", 10, 360),
      // last four full weeks: 20 km/week at 5:00
      run("2026-10-06", 20, 300, 150),
      run("2026-10-13", 20, 300),
      run("2026-10-20", 20, 300),
      run("2026-10-27", 20, 300),
      // this week (not in the averages)
      run("2026-11-03", 5, 330),
      run("2026-11-07", 7, 330),
    ];
    const d = runDashboard(runs, "2026-11-08", 12);
    expect(d.weeks).toHaveLength(12);
    expect(d.weeks[11]).toMatchObject({ monday: "2026-11-02", km: 12, runs: 2, paceSecKm: 330, longestKm: 7 });
    expect(d.thisWeekKm).toBe(12);
    expect(d.avgKm4).toBe(20);
    expect(d.avgKmPrev4).toBe(10);
    expect(d.runs4).toBe(4);
    expect(d.pace4).toBe(300);
    expect(d.pacePrev4).toBe(360);
    // 20 000 m over 100 min × 150 bpm
    expect(d.weeks.find((w) => w.monday === "2026-10-05")?.metersPerBeat).toBeCloseTo(1.33, 2);
    expect(d.longest).toMatchObject({ km: 20, on: "2026-10-06" });
    expect(d.recent[0]).toMatchObject({ km: 7, paceSecKm: 330 });
  });

  it("is empty but well-formed without runs", () => {
    const d = runDashboard([], "2026-11-08");
    expect(d.weeks.every((w) => w.km === 0 && w.paceSecKm == null)).toBe(true);
    expect(d.longest).toBeNull();
    expect(d.pace4).toBeNull();
  });
});
