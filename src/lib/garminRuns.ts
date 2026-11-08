// ============================================================================
// Garmin running history: the import payload and the dashboard's arithmetic.
//
// The payload takes Garmin's data in the shapes the Garmin connector returns
// them (activities, VO2max trend, race predictions), so a sync can forward
// them as they come. Everything below the schemas is pure: same rows in,
// same dashboard out. Nothing here touches the plan or the engine.
// ============================================================================
import crypto from "crypto";
import { z } from "zod";

// ── Auth ────────────────────────────────────────────────────────────────────

/** Bearer GARMIN_IMPORT_SECRET; fails closed when the secret is not set. */
export function garminImportAuthed(req: Request): boolean {
  const expected = process.env.GARMIN_IMPORT_SECRET;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const actual = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Payload ─────────────────────────────────────────────────────────────────

const num = z.number().finite().nonnegative();

const Activity = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d{1,19}$/)]),
  name: z.string().max(500).nullish(),
  type: z.string().max(60),
  event_type: z.string().max(40).nullish(),
  /** Local wall time, "YYYY-MM-DD HH:MM:SS" (or with a T). */
  start_time: z.string().regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/),
  distance_meters: num.nullish(),
  duration_seconds: num.nullish(),
  calories: num.nullish(),
  avg_hr_bpm: num.nullish(),
  max_hr_bpm: num.nullish(),
  elevation_gain_meters: num.nullish(),
});

const Vo2Point = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vo2_max: z.number().finite().nullish(),
  carried_forward: z.boolean().optional(),
});

const Prediction = z.object({ time_seconds: z.number().finite().positive() }).nullish();

const RacePredictions = z.object({
  prediction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  predictions: z.object({
    "5K": Prediction,
    "10K": Prediction,
    half_marathon: Prediction,
    marathon: Prediction,
  }),
});

export const GarminImport = z.object({
  activities: z.array(Activity).max(500).default([]),
  vo2max: z.array(Vo2Point).max(400).default([]),
  race_predictions: RacePredictions.nullish(),
});
export type GarminImportPayload = z.infer<typeof GarminImport>;

export interface GarminRunRow {
  activity_id: number;
  name: string | null;
  activity_type: string;
  event_type: string | null;
  start_local: string;
  distance_m: number;
  duration_s: number;
  avg_hr: number | null;
  max_hr: number | null;
  elevation_gain_m: number | null;
  calories: number | null;
}

/** Running types only: running, treadmill_running, trail_running, track_running … */
export function isRunType(type: string): boolean {
  return /run/i.test(type);
}

const hr = (v?: number | null) => (v != null && v >= 20 && v <= 250 ? Math.round(v) : null);

/** Activities → run rows. Non-runs and runs under 400 m or 2 min are skipped. */
export function mapRuns(payload: GarminImportPayload): { rows: GarminRunRow[]; skipped: number } {
  const rows: GarminRunRow[] = [];
  let skipped = 0;
  for (const a of payload.activities) {
    const distance = a.distance_meters ?? 0;
    const duration = a.duration_seconds ?? 0;
    if (!isRunType(a.type) || distance < 400 || duration < 120 || distance > 400_000 || duration > 172_800) {
      skipped++;
      continue;
    }
    rows.push({
      activity_id: Number(a.id),
      name: a.name?.trim().slice(0, 200) || null,
      activity_type: a.type,
      event_type: a.event_type ?? null,
      start_local: a.start_time.replace(" ", "T").slice(0, 19),
      distance_m: Math.round(distance * 10) / 10,
      duration_s: Math.round(duration),
      avg_hr: hr(a.avg_hr_bpm),
      max_hr: hr(a.max_hr_bpm),
      elevation_gain_m:
        a.elevation_gain_meters != null && a.elevation_gain_meters <= 20_000
          ? Math.round(a.elevation_gain_meters)
          : null,
      calories: a.calories != null && a.calories <= 20_000 ? Math.round(a.calories) : null,
    });
  }
  return { rows, skipped };
}

/** Measured VO2max days only — carried-forward days repeat a value, they do not measure one. */
export function mapVo2(payload: GarminImportPayload): { on_date: string; vo2max: number }[] {
  return payload.vo2max
    .filter((p) => !p.carried_forward && p.vo2_max != null && p.vo2_max >= 10 && p.vo2_max <= 100)
    .map((p) => ({ on_date: p.date, vo2max: Number(p.vo2_max) }));
}

export function mapPredictions(payload: GarminImportPayload): {
  on_date: string;
  pred_5k_sec: number | null;
  pred_10k_sec: number | null;
  pred_half_sec: number | null;
  pred_marathon_sec: number | null;
} | null {
  const rp = payload.race_predictions;
  if (!rp) return null;
  const sec = (p: { time_seconds: number } | null | undefined, lo: number, hi: number) =>
    p && p.time_seconds >= lo && p.time_seconds <= hi ? Math.round(p.time_seconds) : null;
  const row = {
    on_date: rp.prediction_date,
    pred_5k_sec: sec(rp.predictions["5K"], 600, 7200),
    pred_10k_sec: sec(rp.predictions["10K"], 1200, 14400),
    pred_half_sec: sec(rp.predictions.half_marathon, 2400, 36000),
    pred_marathon_sec: sec(rp.predictions.marathon, 4800, 72000),
  };
  return row.pred_5k_sec ?? row.pred_10k_sec ?? row.pred_half_sec ?? row.pred_marathon_sec ? row : null;
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export interface StoredRun {
  activity_id: number | string;
  name: string | null;
  activity_type: string;
  start_local: string;
  distance_m: number | string;
  duration_s: number | string;
  avg_hr: number | null;
  max_hr?: number | null;
  elevation_gain_m?: number | string | null;
  /** Planned session this run was logged against (migration 0037). */
  session_id?: string | null;
}

export interface RunWeek {
  /** Monday, YYYY-MM-DD. */
  monday: string;
  km: number;
  runs: number;
  /** Distance-weighted pace, sec/km; null without runs. */
  paceSecKm: number | null;
  /** Meters per heartbeat over the week's runs with heart rate; null without. */
  metersPerBeat: number | null;
  longestKm: number;
}

export interface RunDashboard {
  weeks: RunWeek[];
  thisWeekKm: number;
  avgKm4: number;
  avgKmPrev4: number;
  runs4: number;
  pace4: number | null;
  pacePrev4: number | null;
  longest: { km: number; on: string; name: string | null } | null;
  recent: (StoredRun & { km: number; paceSecKm: number })[];
}

const DAY_MS = 86_400_000;

export function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  const dow = d.getUTCDay();
  return new Date(d.getTime() - (dow === 0 ? 6 : dow - 1) * DAY_MS).toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  return new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function pool(runs: { distance: number; duration: number }[]): number | null {
  const m = runs.reduce((s, r) => s + r.distance, 0);
  const s = runs.reduce((t, r) => t + r.duration, 0);
  return m > 0 ? Math.round(s / (m / 1000)) : null;
}

/**
 * Weekly buckets (Monday grid, on the run's local date) for the `weeksBack`
 * weeks ending with the week of `today`, plus the KPIs over the last four
 * weeks against the four before.
 */
export function runDashboard(stored: StoredRun[], today: string, weeksBack = 12): RunDashboard {
  const runs = stored
    .map((r) => ({
      ...r,
      day: r.start_local.slice(0, 10),
      distance: Number(r.distance_m),
      duration: Number(r.duration_s),
    }))
    .filter((r) => r.distance > 0 && r.duration > 0)
    .sort((a, b) => a.start_local.localeCompare(b.start_local));

  const thisMonday = mondayOf(today);
  const mondays = Array.from({ length: weeksBack }, (_, i) => addDays(thisMonday, -7 * (weeksBack - 1 - i)));
  const byWeek = new Map<string, typeof runs>();
  for (const r of runs) {
    const m = mondayOf(r.day);
    if (!byWeek.has(m)) byWeek.set(m, []);
    byWeek.get(m)!.push(r);
  }

  const weeks: RunWeek[] = mondays.map((monday) => {
    const list = byWeek.get(monday) ?? [];
    const withHr = list.filter((r) => r.avg_hr != null && r.avg_hr > 0);
    const beats = withHr.reduce((s, r) => s + (r.duration / 60) * (r.avg_hr as number), 0);
    return {
      monday,
      km: round1(list.reduce((s, r) => s + r.distance, 0) / 1000),
      runs: list.length,
      paceSecKm: pool(list),
      metersPerBeat: beats > 0 ? Math.round((withHr.reduce((s, r) => s + r.distance, 0) / beats) * 100) / 100 : null,
      longestKm: round1(Math.max(0, ...list.map((r) => r.distance)) / 1000),
    };
  });

  // Full weeks for the averages: the current week is still running.
  const last4From = addDays(thisMonday, -28);
  const prev4From = addDays(thisMonday, -56);
  const inRange = (from: string, to: string) => runs.filter((r) => r.day >= from && r.day < to);
  const last4 = inRange(last4From, thisMonday);
  const prev4 = inRange(prev4From, last4From);
  const km = (list: typeof runs) => list.reduce((s, r) => s + r.distance, 0) / 1000;

  const windowStart = mondays[0];
  const inWindow = runs.filter((r) => r.day >= windowStart);
  const longestRun = inWindow.reduce<(typeof runs)[number] | null>(
    (best, r) => (!best || r.distance > best.distance ? r : best),
    null,
  );

  return {
    weeks,
    thisWeekKm: weeks[weeks.length - 1]?.km ?? 0,
    avgKm4: round1(km(last4) / 4),
    avgKmPrev4: round1(km(prev4) / 4),
    runs4: last4.length,
    pace4: pool(last4),
    pacePrev4: pool(prev4),
    longest: longestRun ? { km: round1(longestRun.distance / 1000), on: longestRun.day, name: longestRun.name } : null,
    recent: runs
      .slice(-15)
      .reverse()
      .map(({ day: _day, distance, duration, ...r }) => ({
        ...r,
        km: round1(distance / 1000),
        paceSecKm: Math.round(duration / (distance / 1000)),
      })),
  };
}
