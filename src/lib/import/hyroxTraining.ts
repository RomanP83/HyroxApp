// ============================================================================
// Import from the single-file HyroxTraining tracker (its JSON backup, menu →
// Export). Pure mapping, no database: the route stores what this returns.
//
//   finished workouts      → imported_workouts (history, every kind)
//   finished simulations   → athlete_race_results (all 8 runs + 8 stations timed)
//   station records        → benchmark_results (the eight full-distance
//                            station benchmarks; wall balls only when timed
//                            after a HYROX sequence, as the tracker itself
//                            counted them)
//
// Every row carries the tracker's own id as source_id, so importing the same
// backup twice adds nothing, and a newer backup adds only what is new.
// ============================================================================

export const IMPORT_SOURCE = "hyroxtraining";

/** The tracker's station ids, in race order. */
const ORDER = ["ski", "push", "pull", "bbj", "row", "carry", "lunges", "wall"] as const;

/** Tracker record metric → HyroxApp benchmark slug (migration 0030). */
export const RECORD_SLUGS: Record<string, string> = {
  ski: "station_ski_1000",
  push: "station_push_50",
  pull: "station_pull_50",
  bbj: "station_bbj_80",
  row: "station_row_1000",
  carry: "station_farmers_200",
  lunges: "station_lunges_100",
  wall: "station_wallballs_100",
};

export interface ImportedWorkoutRow {
  source: string;
  source_id: string;
  done_on: string;
  kind: string;
  title: string | null;
  duration_min: number | null;
  rpe: number | null;
  distance_km: number | null;
  notes: string | null;
}

export interface ImportedRaceRow {
  source: string;
  source_id: string;
  kind: "race" | "simulation";
  held_on: string;
  label: string | null;
  is_baseline: false;
  total_sec: number;
  runs_sec: number[];
  stations_sec: number[];
  roxzone_sec: number | null;
}

export interface ImportedBenchmarkRow {
  source: string;
  source_id: string;
  slug: string;
  value: number;
  recorded_at: string;
}

export interface ImportPlan {
  workouts: ImportedWorkoutRow[];
  races: ImportedRaceRow[];
  benchmarks: ImportedBenchmarkRow[];
  /** What was left out, and why — shown to the athlete after the import. */
  skipped: Record<string, number>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The tracker's time parser: "4:30", "1:24:55" or a number of seconds. */
export function secs(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  const parts = String(v ?? "").trim().split(":");
  if (!parts[0]) return null;
  const nums = parts.map(Number);
  if (parts.length > 3 || nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const s = nums.reduce((acc, n) => acc * 60 + n, 0);
  return s > 0 ? Math.round(s) : null;
}

function num(v: unknown, max: number): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
}

const text = (v: unknown, max: number): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Accepts the backup as exported ({ format, exportedAt, data }) or the bare
 * data object. Throws only when it is not a tracker backup at all.
 */
export function unwrapBackup(raw: unknown): { workouts: unknown[]; records: unknown[] } {
  const data = isObj(raw) && isObj(raw.data) ? raw.data : raw;
  if (!isObj(data) || !Array.isArray(data.workouts) || !Array.isArray(data.records)) {
    throw new Error("not_a_tracker_backup");
  }
  return { workouts: data.workouts, records: data.records };
}

/**
 * Only the fields the import reads — so the browser sends a few kilobytes,
 * not the whole backup with every set of every strength session.
 */
export function slimBackup(raw: unknown): { workouts: Record<string, unknown>[]; records: Record<string, unknown>[] } {
  const { workouts, records } = unwrapBackup(raw);
  return {
    workouts: workouts.filter(isObj).filter((w) => w.completed === true).map((w) => ({
      id: w.id,
      date: w.date,
      kind: w.kind,
      title: w.title,
      completed: true,
      duration: w.duration,
      sessionRpe: w.sessionRpe,
      distance: w.distance,
      notes: w.notes,
      race: w.race,
      roxTime: w.roxTime,
      roxIncluded: w.roxIncluded,
      raceLegs: Array.isArray(w.raceLegs)
        ? w.raceLegs.filter(isObj).map((l) => ({ runTime: l.runTime, stationTime: l.stationTime }))
        : undefined,
    })),
    records: records.filter(isObj).map((r) => ({ id: r.id, metric: r.metric, date: r.date, time: r.time, context: r.context })),
  };
}

export function mapHyroxTraining(raw: unknown): ImportPlan {
  const { workouts, records } = unwrapBackup(raw);
  const skipped: Record<string, number> = {};
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);

  const out: ImportPlan = { workouts: [], races: [], benchmarks: [], skipped };

  for (const w of workouts) {
    if (!isObj(w) || w.completed !== true) continue; // drafts and plans are not history
    const id = typeof w.id === "string" && w.id ? w.id : null;
    const date = typeof w.date === "string" && DATE.test(w.date) ? w.date : null;
    const kind = text(w.kind, 40);
    if (!id || !date || !kind) {
      skip("workout_without_id_date_or_kind");
      continue;
    }
    out.workouts.push({
      source: IMPORT_SOURCE,
      source_id: id,
      done_on: date,
      kind,
      title: text(w.title, 200),
      duration_min: (() => {
        const d = num(w.duration, 600);
        return d == null ? null : Math.round(d);
      })(),
      rpe: num(w.sessionRpe, 10),
      distance_km: num(w.distance, 200),
      notes: text(w.notes, 2000),
    });

    if (kind === "Simulation") {
      const legs = Array.isArray(w.raceLegs) ? w.raceLegs.filter(isObj) : [];
      const runs = legs.map((l) => secs(l.runTime));
      const stations = legs.map((l) => secs(l.stationTime));
      const roxIncluded = w.roxIncluded === true;
      const rox = roxIncluded ? null : secs(w.roxTime);
      const complete =
        legs.length === 8 && runs.every((x) => x != null) && stations.every((x) => x != null) && (roxIncluded || rox != null);
      if (!complete) {
        skip("simulation_without_all_splits");
        continue;
      }
      const total =
        (runs as number[]).reduce((a, b) => a + b, 0) + (stations as number[]).reduce((a, b) => a + b, 0) + (rox ?? 0);
      out.races.push({
        source: IMPORT_SOURCE,
        source_id: id,
        kind: w.race === true ? "race" : "simulation",
        held_on: date,
        label: text(w.title, 80),
        is_baseline: false,
        total_sec: total,
        runs_sec: runs as number[],
        stations_sec: stations as number[],
        roxzone_sec: rox,
      });
    }
  }

  for (const r of records) {
    if (!isObj(r)) continue;
    const id = typeof r.id === "string" && r.id ? r.id : null;
    const date = typeof r.date === "string" && DATE.test(r.date) ? r.date : null;
    const metric = typeof r.metric === "string" ? r.metric : "";
    const value = secs(r.time);
    if (!id || !date || value == null) {
      skip("record_without_id_date_or_time");
      continue;
    }
    const slug = RECORD_SLUGS[metric];
    if (!slug) {
      // "run" and "rox" are race totals, not station benchmarks.
      skip("record_not_a_station_benchmark");
      continue;
    }
    if (metric === "wall" && r.context !== "sequence") {
      skip("wall_balls_not_after_a_sequence");
      continue;
    }
    out.benchmarks.push({ source: IMPORT_SOURCE, source_id: id, slug, value, recorded_at: `${date}T12:00:00.000Z` });
  }

  return out;
}

export { ORDER as TRACKER_STATION_ORDER };
