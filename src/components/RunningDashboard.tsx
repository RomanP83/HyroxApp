// ============================================================================
// The running dashboard's body (/progress/running): pure rendering of the
// imported Garmin rows, so it can be rendered without a database.
// ============================================================================
import Link from "next/link";
import { BarChart, LineChart, type Pt } from "@/components/charts";
import { dateInTrainingZone } from "@/lib/planClock";
import { fmtCalendarDate, fmtClock, fmtPace } from "@/lib/format";
import { runDashboard, type StoredRun } from "@/lib/garminRuns";

const WEEKS = 12;

export interface FitnessRow {
  on_date: string;
  vo2max: number | string | null;
  pred_5k_sec: number | null;
  pred_10k_sec: number | null;
  pred_half_sec: number | null;
  pred_marathon_sec: number | null;
}

export type ImportedRun = StoredRun & { imported_at: string };

const weekLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function RunningDashboard({
  runs,
  fitness,
  today,
}: {
  runs: ImportedRun[];
  fitness: FitnessRow[];
  /** YYYY-MM-DD in the training time zone. */
  today: string;
}) {
  const lastSync = runs.reduce<string | null>((m, r) => (!m || r.imported_at > m ? r.imported_at : m), null);

  if (!runs.length && !fitness.length) {
    return (
      <div className="space-y-6">
        <Title lastSync={null} />
        <div className="card space-y-2">
          <h2 className="font-semibold">No Garmin runs yet</h2>
          <p className="text-sm text-ash">
            This page fills once runs arrive from Garmin through the import endpoint
            (<code>/api/garmin/import</code>). Until the sync has run, there is nothing to show.
          </p>
        </div>
      </div>
    );
  }

  const d = runDashboard(runs, today, WEEKS);

  const kmBars: Pt[] = d.weeks.map((w) => ({ label: weekLabel(w.monday), y: w.km }));
  const paceLine: Pt[] = d.weeks
    .filter((w) => w.paceSecKm != null)
    .map((w) => ({ label: weekLabel(w.monday), y: w.paceSecKm as number }));
  const efficiency: Pt[] = d.weeks
    .filter((w) => w.metersPerBeat != null)
    .map((w) => ({ label: weekLabel(w.monday), y: w.metersPerBeat as number }));
  const vo2: Pt[] = fitness
    .filter((f) => f.vo2max != null)
    .map((f) => ({ label: fmtCalendarDate(f.on_date).slice(0, 5), y: Number(f.vo2max) }));

  const preds = fitness.filter((f) => f.pred_5k_sec ?? f.pred_10k_sec ?? f.pred_half_sec ?? f.pred_marathon_sec);
  const latestPred = preds[preds.length - 1] ?? null;
  const firstPred = preds.length > 1 ? preds[0] : null;

  const kmDelta = d.avgKm4 - d.avgKmPrev4;
  const paceDelta = d.pace4 != null && d.pacePrev4 != null ? d.pace4 - d.pacePrev4 : null;

  return (
    <div className="space-y-6">
      <Title lastSync={lastSync} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="This week" value={`${d.thisWeekKm.toFixed(1)} km`} />
        <Tile
          label="Avg. km / week (4 wk)"
          value={`${d.avgKm4.toFixed(1)} km`}
          note={d.avgKmPrev4 > 0 ? `${kmDelta >= 0 ? "+" : "−"}${Math.abs(kmDelta).toFixed(1)} km vs. 4 wk before` : undefined}
        />
        <Tile
          label="Avg. pace (4 wk)"
          value={fmtPace(d.pace4 ?? undefined)}
          note={
            paceDelta != null && paceDelta !== 0
              ? `${fmtClock(Math.abs(paceDelta))}/km ${paceDelta < 0 ? "faster" : "slower"} than 4 wk before`
              : undefined
          }
        />
        <Tile label="Runs (4 wk)" value={String(d.runs4)} note={d.longest ? `Longest (12 wk): ${d.longest.km} km` : undefined} />
      </div>

      <Card title="Weekly distance" sub={`Kilometres per week, last ${WEEKS} weeks — the current week is still running`}>
        <BarChart bars={kmBars} fmt={(v) => String(Math.round(v))} />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Average pace per week" sub="All runs, weighted by distance — lower is faster">
          <LineChart series={paceLine} fmt={(v) => fmtPace(v)} />
        </Card>
        <Card title="Aerobic efficiency" sub="Metres per heartbeat (runs with heart rate) — higher is fitter">
          <LineChart series={efficiency} fmt={(v) => v.toFixed(2)} />
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="VO2max" sub="Garmin's estimate, days with a new value only">
          <LineChart series={vo2} fmt={(v) => v.toFixed(1)} />
        </Card>
        <div className="card">
          <h2 className="font-semibold">Race predictions</h2>
          <p className="mb-3 text-xs text-ash">
            {latestPred
              ? `Garmin, as of ${fmtCalendarDate(latestPred.on_date)}${firstPred ? ` · change since ${fmtCalendarDate(firstPred.on_date)}` : ""}`
              : "No prediction imported yet"}
          </p>
          {latestPred && (
            <dl className="grid grid-cols-2 gap-3">
              {(
                [
                  ["5 km", "pred_5k_sec"],
                  ["10 km", "pred_10k_sec"],
                  ["Half marathon", "pred_half_sec"],
                  ["Marathon", "pred_marathon_sec"],
                ] as const
              ).map(([label, key]) => {
                const now = latestPred[key];
                const then = firstPred?.[key] ?? null;
                const diff = now != null && then != null ? now - then : null;
                return (
                  <div key={key}>
                    <dt className="text-xs text-ash">{label}</dt>
                    <dd className="text-xl font-bold tabular-nums">{fmtClock(now)}</dd>
                    {diff != null && diff !== 0 && (
                      <dd className="text-xs text-bone">
                        {diff < 0 ? "−" : "+"}
                        {fmtClock(Math.abs(diff))}
                      </dd>
                    )}
                  </div>
                );
              })}
            </dl>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-semibold">Recent runs</h2>
        <p className="mb-3 text-xs text-ash">The last {d.recent.length} runs from Garmin</p>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-ash">
              <th className="py-1 pr-3 font-normal">Date</th>
              <th className="py-1 pr-3 font-normal">Run</th>
              <th className="py-1 pr-3 text-right font-normal">km</th>
              <th className="hidden py-1 pr-3 text-right font-normal sm:table-cell">Time</th>
              <th className="py-1 pr-3 text-right font-normal">Pace</th>
              <th className="py-1 text-right font-normal">Ø HR</th>
            </tr>
          </thead>
          <tbody>
            {d.recent.map((r) => (
              <tr key={String(r.activity_id)} className="border-t border-edge">
                <td className="py-1.5 pr-3 whitespace-nowrap">{fmtCalendarDate(r.start_local)}</td>
                <td className="py-1.5 pr-3">
                  {r.name ?? "Run"}
                  {/treadmill|indoor/i.test(r.activity_type) && <span className="ml-1 text-xs text-ash">· treadmill</span>}
                </td>
                <td className="py-1.5 pr-3 text-right">{r.km.toFixed(1)}</td>
                <td className="hidden py-1.5 pr-3 text-right sm:table-cell">{fmtClock(Number(r.duration_s))}</td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap">{fmtPace(r.paceSecKm)}</td>
                <td className="py-1.5 text-right">{r.avg_hr ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Title({ lastSync }: { lastSync: string | null }) {
  return (
    <div className="space-y-1">
      <Link href="/progress" className="text-sm text-ash hover:text-chalk">
        ← Progress
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-h1 font-bold tracking-tight">Running</h1>
        <span className="pill">
          from Garmin{lastSync ? ` · synced ${fmtCalendarDate(dateInTrainingZone(new Date(lastSync)))}` : ""}
        </span>
      </div>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-ash">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-xs text-ash">{note}</div>}
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-ash">{sub}</p>
      {children}
    </div>
  );
}
