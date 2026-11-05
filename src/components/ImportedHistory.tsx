import { BarChart, type Pt } from "./charts";

export interface ImportedWorkout {
  done_on: string;
  kind: string;
  duration_min: number | null;
}

const DAY_MS = 86_400_000;

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay();
  return new Date(d.getTime() - (dow === 0 ? 6 : dow - 1) * DAY_MS).toISOString().slice(0, 10);
}

/** Sessions and hours per calendar week, the most recent `weeks` weeks that have any. */
export function weeklyHistory(rows: ImportedWorkout[], weeks = 20): { sessions: Pt[]; hours: Pt[] } {
  const by = new Map<string, { n: number; min: number }>();
  for (const r of rows) {
    const k = mondayOf(r.done_on);
    const cur = by.get(k) ?? { n: 0, min: 0 };
    cur.n += 1;
    cur.min += r.duration_min ?? 0;
    by.set(k, cur);
  }
  const keys = [...by.keys()].sort().slice(-weeks);
  return {
    sessions: keys.map((k) => ({ label: k.slice(5), y: by.get(k)!.n })),
    hours: keys.map((k) => ({ label: k.slice(5), y: Math.round((by.get(k)!.min / 60) * 10) / 10 })),
  };
}

/**
 * The history imported from HyroxTraining, on /progress. It is history only:
 * none of it feeds the engine's load ratio or the plan.
 */
export function ImportedHistory({ rows }: { rows: ImportedWorkout[] }) {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => a.done_on.localeCompare(b.done_on));
  const { sessions, hours } = weeklyHistory(sorted);
  const kinds = new Map<string, number>();
  for (const r of sorted) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);

  return (
    <section className="space-y-4" data-testid="imported-history">
      <h2 className="text-lg font-semibold">Imported history</h2>
      <div className="card">
        <p className="text-sm">
          <b>{sorted.length}</b> workouts from HyroxTraining, {sorted[0].done_on} to {sorted.at(-1)!.done_on}.
        </p>
        <p className="mt-1 text-xs text-ash">
          {[...kinds.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => `${k} ${n}`)
            .join(" · ")}
        </p>
        <p className="mt-2 text-xs text-smoke">
          History only — it does not count into the load ratio (ACWR) or change the plan.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <h3 className="font-semibold">Sessions per week</h3>
          <p className="mb-3 text-xs text-ash">Imported, by calendar week (Monday)</p>
          <BarChart bars={sessions} fmt={(v) => String(v)} />
        </div>
        <div className="card">
          <h3 className="font-semibold">Hours per week</h3>
          <p className="mb-3 text-xs text-ash">From the logged durations</p>
          <BarChart bars={hours} fmt={(v) => `${v} h`} />
        </div>
      </div>
    </section>
  );
}
