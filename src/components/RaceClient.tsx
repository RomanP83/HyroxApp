"use client";

// ============================================================================
// Race day, from both sides.
//
// Above: the goal time, budgeted backwards into the seventeen segments it
// actually consists of — because "1:25" is not a plan and "4:05 per kilometre,
// 3:00 on the sled" is.
//
// Below: what a race really cost, entered once and read as minutes rather than
// tiers. That entry is also the best calibration the app gets: it resets the
// station tiers, which steer the catalogues and the finish-time estimate.
// ============================================================================
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  pacingPlan,
  stationCosts,
  STATION_LABELS,
  STATION_ORDER,
  type Division,
  type ExperienceLevel,
  type PaceZones,
  type Station,
} from "@/lib/engine";
import { readApi } from "@/lib/apiResult";
import { fmtClock, fmtPace } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { AppHeader } from "./AppHeader";
import { CalendarIcon, CheckIcon, RunIcon, SpinnerIcon } from "./icons";

export interface LoggedResult {
  id: string;
  race_date: string;
  division: Division;
  name: string | null;
  total_seconds: number;
  run_splits: number[];
  station_times: Record<string, number>;
  roxzone_seconds: number | null;
}

interface Props {
  division: Division;
  level: ExperienceLevel;
  tiers: Record<string, number>;
  paceZones: PaceZones;
  predictedSeconds: number | null;
  nextRaceDate: string | null;
  results: LoggedResult[];
}

/** "1:25:30" or "5:30" back into seconds; blank and nonsense become null. */
function parseClock(text: string): number | null {
  const parts = text.trim().split(":").map((p) => Number(p));
  if (!parts.length || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? Math.round(seconds) : null;
}

export function RaceClient(props: Props) {
  const router = useRouter();
  const latest = props.results[0] ?? null;

  // The measured times win wherever a race has been logged; the tier estimate
  // is there to fill the gap until one is.
  const measured = useMemo(() => {
    if (!latest) return undefined;
    const out: Partial<Record<Station, number>> = {};
    for (const station of STATION_ORDER) {
      const value = latest.station_times?.[station];
      if (typeof value === "number" && value > 0) out[station] = value;
    }
    return Object.keys(out).length ? out : undefined;
  }, [latest]);

  const costs = useMemo(
    () => stationCosts({ division: props.division, tiers: props.tiers, measured }),
    [props.division, props.tiers, measured],
  );

  const [goal, setGoal] = useState(
    fmtClock(props.predictedSeconds ?? latest?.total_seconds ?? 5400),
  );
  const goalSeconds = parseClock(goal);
  const plan = useMemo(
    () =>
      goalSeconds
        ? pacingPlan({
            division: props.division,
            level: props.level,
            goalSeconds,
            tiers: props.tiers,
            paceZones: props.paceZones,
            measured,
          })
        : null,
    [goalSeconds, props.division, props.level, props.tiers, props.paceZones, measured],
  );

  return (
    <main className="mx-auto max-w-3xl space-y-6 pb-16 animate-fade-up">
      <AppHeader
        countdown={
          props.nextRaceDate
            ? {
                label: "Race day",
                days: Math.max(
                  0,
                  Math.round(
                    (new Date(`${props.nextRaceDate}T00:00:00Z`).getTime() - Date.now()) / 86_400_000,
                  ),
                ),
              }
            : undefined
        }
      />

      <PacingSection goal={goal} setGoal={setGoal} plan={plan} costs={costs} />
      <CostSection costs={costs} hasResult={Boolean(measured)} />
      <ResultSection
        division={props.division}
        nextRaceDate={props.nextRaceDate}
        results={props.results}
        onSaved={() => router.refresh()}
      />
    </main>
  );
}

function PacingSection({
  goal,
  setGoal,
  plan,
  costs,
}: {
  goal: string;
  setGoal: (v: string) => void;
  plan: ReturnType<typeof pacingPlan> | null;
  costs: ReturnType<typeof stationCosts>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-micro font-semibold uppercase tracking-widest text-ash">
        Your race, minute by minute
      </h2>
      <div className="card space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-micro font-semibold uppercase tracking-wider text-ash">
              Goal time
            </span>
            <input
              className="input w-40 font-mono tabular-nums"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="1:25:00"
              aria-label="Goal finish time"
            />
          </label>
          {plan && !plan.impossible && (
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Figure label="Run every km at" value={fmtPace(plan.required_pace_sec_km)} accent />
              <Figure label="Stations" value={fmtClock(plan.station_seconds)} />
              <Figure label="Roxzone" value={fmtClock(plan.roxzone_seconds)} />
            </div>
          )}
        </div>

        {plan?.impossible && (
          <p className="text-meta leading-relaxed text-stop">
            The stations and transitions alone come to {fmtClock(plan.station_seconds + plan.roxzone_seconds)} —
            more than the goal. There is no pace that makes this one work.
          </p>
        )}

        {plan && !plan.impossible && plan.gap_seconds > 0 && (
          // The honest reading of a goal: it asks for a pace the athlete does
          // not have yet, and the difference has to come from somewhere.
          <p className="max-w-[62ch] text-meta leading-relaxed text-amber">
            This asks for {fmtPace(plan.required_pace_sec_km)} against your current race pace of{" "}
            {fmtPace(plan.current_pace_sec_km)} — <b>{fmtClock(plan.gap_seconds)} short</b> over the
            eight kilometres. Either the running gets faster, or the time comes out of the stations
            below.
          </p>
        )}
        {plan && !plan.impossible && plan.gap_seconds === 0 && (
          <p className="max-w-[62ch] text-meta leading-relaxed text-go">
            Your current race pace of {fmtPace(plan.current_pace_sec_km)} already covers this. The
            stations are what decide it now.
          </p>
        )}

        {plan && !plan.impossible && (
          <div className="overflow-x-auto">
            <table className="w-full text-meta">
              <thead>
                <tr className="border-b border-edge text-micro uppercase tracking-wider text-ash">
                  <th className="py-2 text-left font-semibold">Segment</th>
                  <th className="py-2 text-right font-semibold">Split</th>
                  <th className="py-2 text-right font-semibold">Elapsed</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {plan.segments.map((segment, i) => {
                  const cost = costs.find((c) => c.station === segment.station);
                  const risky = cost != null && cost.cost_seconds >= 30;
                  return (
                    <tr
                      key={i}
                      className={`border-b border-edge/40 ${
                        segment.kind === "roxzone" ? "text-smoke" : "text-bone"
                      }`}
                    >
                      <td className="py-1.5 font-sans">
                        {segment.label}
                        {risky && (
                          <span className="ml-2 pill text-amber">
                            +{fmtClock(cost!.cost_seconds)}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right">{fmtClock(segment.seconds)}</td>
                      <td className="py-1.5 text-right text-chalk">
                        {fmtClock(segment.cumulative_seconds)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function CostSection({
  costs,
  hasResult,
}: {
  costs: ReturnType<typeof stationCosts>;
  hasResult: boolean;
}) {
  const total = costs.reduce((n, c) => n + c.cost_seconds, 0);
  const worst = costs[0];
  return (
    <section className="space-y-3">
      <h2 className="text-micro font-semibold uppercase tracking-widest text-ash">
        What each station is costing you
      </h2>
      <div className="card space-y-3">
        <p className="max-w-[62ch] text-meta leading-relaxed text-ash">
          Against the version of you that owns that station. {hasResult ? (
            <>Measured from your last race.</>
          ) : (
            <>
              Estimated from your station tiers —{" "}
              <b className="text-bone">log a race below and these become real numbers.</b>
            </>
          )}
        </p>
        {worst && worst.cost_seconds > 0 && (
          <p className="max-w-[62ch] text-lead leading-snug text-chalk">
            Your {STATION_LABELS[worst.station].toLowerCase()} costs you{" "}
            <span className="font-mono tabular-nums text-flame">{fmtClock(worst.cost_seconds)}</span>
            . Across all eight it is {fmtClock(total)}.
          </p>
        )}
        <ul className="space-y-1.5">
          {costs.map((cost) => {
            const share = total > 0 ? cost.cost_seconds / (costs[0].cost_seconds || 1) : 0;
            return (
              <li key={cost.station} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-meta text-bone sm:w-52">
                  {STATION_LABELS[cost.station]}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-well">
                  <span
                    className="block h-full rounded-full bg-flame/70"
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-meta tabular-nums text-ash sm:w-24">
                  {cost.cost_seconds > 0 ? `+${fmtClock(cost.cost_seconds)}` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function ResultSection({
  division,
  nextRaceDate,
  results,
  onSaved,
}: {
  division: Division;
  nextRaceDate: string | null;
  results: LoggedResult[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(results.length === 0);
  const [date, setDate] = useState(nextRaceDate ?? new Date().toISOString().slice(0, 10));
  const [total, setTotal] = useState("");
  const [runs, setRuns] = useState<string[]>(Array(8).fill(""));
  const [stations, setStations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const totalSeconds = parseClock(total);
    if (!totalSeconds) {
      setMessage("A finish time is needed — everything else is optional.");
      return;
    }
    setSaving(true);
    setMessage(null);
    haptic("confirm");
    const stationTimes: Record<string, number> = {};
    for (const [station, text] of Object.entries(stations)) {
      const seconds = parseClock(text);
      if (seconds) stationTimes[station] = seconds;
    }
    const res = await fetch("/api/races/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        race_date: date,
        division,
        total_seconds: totalSeconds,
        run_splits: runs.map(parseClock).filter((v): v is number => v != null),
        station_times: stationTimes,
      }),
    });
    const result = await readApi<{ recalibrated: number }>(res);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage(
      result.data.recalibrated
        ? `Saved. ${result.data.recalibrated} station${
            result.data.recalibrated === 1 ? "" : "s"
          } recalibrated from what the race actually showed.`
        : "Saved.",
    );
    setOpen(false);
    onSaved();
  }

  return (
    <section className="space-y-3">
      <h2 className="text-micro font-semibold uppercase tracking-widest text-ash">Your races</h2>

      {results.length > 0 && (
        <div className="card space-y-2">
          {results.map((race) => (
            <div key={race.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-meta text-bone">
                <span className="font-mono tabular-nums">{race.race_date}</span>
                {race.name ? ` · ${race.name}` : ""} · {race.division.replace("_", " ")}
              </span>
              <span className="font-mono text-lead tabular-nums text-chalk">
                {fmtClock(race.total_seconds)}
                {race.roxzone_seconds != null && (
                  <span className="ml-2 text-meta text-ash">
                    roxzone {fmtClock(race.roxzone_seconds)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card space-y-3">
        <button
          className="flex w-full items-center justify-between text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="text-lead font-semibold text-chalk">Log a race</span>
          <span className="text-meta text-ash">{open ? "close" : "open"}</span>
        </button>

        {open && (
          <div className="space-y-4">
            <p className="max-w-[62ch] text-meta leading-relaxed text-ash">
              The finish time is all that is required; every split you add makes the picture
              sharper. Station times reset your tiers, which is what steers the sessions you get
              next. Times as <span className="font-mono">mm:ss</span> or{" "}
              <span className="font-mono">h:mm:ss</span>.
            </p>

            <div className="flex flex-wrap gap-3">
              <label className="block">
                <span className="mb-1 block text-micro font-semibold uppercase tracking-wider text-ash">
                  Race date
                </span>
                <input
                  className="input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-micro font-semibold uppercase tracking-wider text-ash">
                  Finish time
                </span>
                <input
                  className="input w-40 font-mono tabular-nums"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="1:25:30"
                />
              </label>
            </div>

            <div>
              <div className="mb-1 text-micro font-semibold uppercase tracking-wider text-ash">
                Run splits
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {runs.map((value, i) => (
                  // The run number is a label above the box, not the box's
                  // placeholder: a greyed "1" inside an empty field reads as a
                  // split of one second.
                  <label key={i} className="block">
                    <span className="mb-1 block text-center font-mono text-micro font-semibold tabular-nums text-ash">
                      {i + 1}
                    </span>
                    <input
                      className="input w-full px-2 text-center font-mono tabular-nums"
                      value={value}
                      aria-label={`Run ${i + 1}`}
                      placeholder="mm:ss"
                      onChange={(e) =>
                        setRuns((prev) => prev.map((v, j) => (i === j ? e.target.value : v)))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-micro font-semibold uppercase tracking-wider text-ash">
                Station times
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {STATION_ORDER.map((station) => (
                  <label key={station} className="flex items-center gap-2">
                    <span className="flex-1 text-meta text-bone">{STATION_LABELS[station]}</span>
                    <input
                      className="input w-24 px-2 text-center font-mono tabular-nums"
                      value={stations[station] ?? ""}
                      aria-label={STATION_LABELS[station]}
                      placeholder="mm:ss"
                      onChange={(e) =>
                        setStations((prev) => ({ ...prev, [station]: e.target.value }))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4">
              <button className="btn-primary" onClick={() => void save()} disabled={saving}>
                {saving ? <SpinnerIcon size={16} /> : <CheckIcon size={16} />}
                Save the race
              </button>
              <span className="text-micro text-ash">
                Your pace zones are left alone — the benchmarks own those.
              </span>
            </div>
          </div>
        )}

        {message && <p className="text-meta leading-relaxed text-bone">{message}</p>}
      </div>
    </section>
  );
}

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-micro font-semibold uppercase tracking-wider text-ash">{label}</div>
      <div
        className={`font-mono text-h3 tabular-nums ${accent ? "text-flame" : "text-chalk"}`}
      >
        {value}
      </div>
    </div>
  );
}
