import Link from "next/link";
import type { RaceAnalysis, RaceResult, SegmentAnalysis } from "@/lib/engine";
import { fmtClock } from "@/lib/format";
import { LineChart, type Pt } from "./charts";

const STATUS: Record<SegmentAnalysis["status"], { label: string; cls: string }> = {
  on_target: { label: "on target", cls: "text-go" },
  close: { label: "close", cls: "text-amber" },
  needs_work: { label: "needs work", cls: "text-stop" },
  no_data: { label: "no data", cls: "text-smoke" },
};

const signed = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmtClock(Math.abs(v))}`);
const perKm = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v)} s/km`);

/**
 * The race analysis on /progress: where the last race or simulation stands
 * against the target, segment by segment. Every number comes from
 * analyseRaces(); this component only lays it out.
 */
export function RaceReadiness({ analysis, results }: { analysis: RaceAnalysis; results: RaceResult[] }) {
  const a = analysis;
  const hasAny = results.length > 0;

  const totals: Pt[] = [...results]
    .sort((x, y) => x.held_on.localeCompare(y.held_on))
    .map((r) => ({ label: r.held_on.slice(5), y: r.total_sec }));

  return (
    <section className="space-y-4" data-testid="race-readiness">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Race readiness</h2>
        <Link href="/benchmarks" className="text-xs text-ash underline">
          enter races &amp; simulations →
        </Link>
      </div>

      {!hasAny || !a.target_sec ? (
        <div className="card text-sm text-ash">
          {!a.target_sec && <p>Set a target time on Benchmarks to get target splits and the gap per segment.</p>}
          {!hasAny && (
            <p>
              Log a full simulation or a race with its splits on Benchmarks. Mark your reference race
              as the baseline to see readiness from there to your target.
            </p>
          )}
        </div>
      ) : null}

      {hasAny && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Tile label="Target" value={fmtClock(a.target_sec)} />
            <Tile
              label={a.latest ? `Latest ${a.latest.kind}` : "Latest"}
              value={fmtClock(a.latest?.total_sec ?? null)}
            />
            <Tile label="Gap to target" value={signed(a.total_gap)} />
            <Tile
              label="Readiness"
              value={a.readiness == null ? "—" : `${a.readiness}%`}
              sub={
                a.readiness == null
                  ? a.baseline
                    ? `${a.readiness_coverage.with_data}/${a.readiness_coverage.total} segments with data`
                    : "needs a baseline"
                  : "baseline → target, all segments"
              }
            />
          </div>

          {a.target_sec && (
            <div className="card overflow-x-auto">
              <h3 className="font-semibold">Segments</h3>
              <p className="mb-3 text-xs text-ash">
                Target splits keep the shape of your baseline{a.baseline ? ` (${a.baseline.label ?? a.baseline.held_on})` : " — none set, so a typical split is used"}.
                Current = the newest result that timed the segment.
              </p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ash">
                  <tr>
                    <th className="py-1 pr-2 font-normal">Segment</th>
                    <th className="py-1 pr-2 text-right font-normal">Baseline</th>
                    <th className="py-1 pr-2 text-right font-normal">Current</th>
                    <th className="py-1 pr-2 text-right font-normal">Target</th>
                    <th className="py-1 pr-2 text-right font-normal">Gap</th>
                    <th className="py-1 text-right font-normal">Status</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {a.segments.map((s) => (
                    <tr key={s.key} className="border-t border-edge">
                      <td className="py-1.5 pr-2 font-sans">{s.label}</td>
                      <td className="py-1.5 pr-2 text-right text-ash">{fmtClock(s.baseline)}</td>
                      <td className="py-1.5 pr-2 text-right">{fmtClock(s.current)}</td>
                      <td className="py-1.5 pr-2 text-right text-ash">{fmtClock(s.target)}</td>
                      <td className="py-1.5 pr-2 text-right">{signed(s.gap)}</td>
                      <td className={`py-1.5 text-right font-sans text-xs ${STATUS[s.status].cls}`}>
                        {STATUS[s.status].label}
                        {s.progress != null && <span className="text-ash"> · {s.progress}%</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {a.weakest.length > 0 && (
                <p className="mt-3 text-sm">
                  Furthest behind: <b>{a.weakest.map((s) => s.label).join(", ")}</b>
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card">
              <div className="text-xs text-ash">Pace lost after the burpee broad jumps</div>
              <div className="text-2xl font-bold">{perKm(a.post_bbj_loss.latest)}</div>
              <p className="mt-1 text-xs text-ash">
                Run 5 against the mean of runs 1–4. Baseline: {perKm(a.post_bbj_loss.baseline)}
              </p>
            </div>
            <div className="card">
              <div className="text-xs text-ash">Fade over the race</div>
              <div className="text-2xl font-bold">{perKm(a.run_fade.latest)}</div>
              <p className="mt-1 text-xs text-ash">
                Runs 5–8 against runs 1–4. Baseline: {perKm(a.run_fade.baseline)}
              </p>
            </div>
          </div>

          {totals.length > 1 && (
            <div className="card">
              <h3 className="font-semibold">Finish times</h3>
              <p className="mb-3 text-xs text-ash">Races and simulations, against your target</p>
              <LineChart
                series={totals}
                fmt={(v) => fmtClock(v)}
                refLines={a.target_sec ? [{ y: a.target_sec, label: `target ${fmtClock(a.target_sec)}` }] : undefined}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-ash">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-smoke">{sub}</div>}
    </div>
  );
}
