"use client";

import { useState } from "react";
import { fmtClock, parseClock } from "@/lib/format";
import { STATIONS, STATION_LABELS, type RaceResult } from "@/lib/engine";

/**
 * Races and full simulations with their splits, plus the target time they are
 * measured against. The analysis of these numbers lives on /progress; this
 * card only records them.
 */
export function RaceResultsCard({
  results,
  targetTimeSec,
  onToast,
  onSaved,
}: {
  results: RaceResult[];
  targetTimeSec: number | null;
  onToast: (msg: string) => void;
  onSaved: () => void;
}) {
  const [target, setTarget] = useState(targetTimeSec ? fmtClock(targetTimeSec) : "");
  const [kind, setKind] = useState<"simulation" | "race">("simulation");
  const [heldOn, setHeldOn] = useState("");
  const [label, setLabel] = useState("");
  const [total, setTotal] = useState("");
  const [baseline, setBaseline] = useState(false);
  const [runs, setRuns] = useState<string[]>(Array(8).fill(""));
  const [stations, setStations] = useState<string[]>(Array(8).fill(""));
  const [roxzone, setRoxzone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "request failed");
    return data;
  }

  async function saveTarget() {
    const raw = target.trim();
    const value = raw === "" ? null : parseClock(raw);
    if (raw !== "" && (value == null || value < 2400 || value > 14400)) {
      onToast("Target time is h:mm:ss, between 40:00 and 4:00:00.");
      return;
    }
    setBusy("target");
    try {
      await call("/api/profile/target-time", "PATCH", { target_time_sec: value });
      onToast(value == null ? "Target time cleared." : `Target time set to ${fmtClock(value)}.`);
      onSaved();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveResult() {
    const parseList = (xs: string[]) => xs.map((x) => (x.trim() ? parseClock(x) : null));
    const runSec = parseList(runs);
    const stationSec = parseList(stations);
    const bad =
      runs.some((x, i) => x.trim() && runSec[i] == null) ||
      stations.some((x, i) => x.trim() && stationSec[i] == null) ||
      (roxzone.trim() && parseClock(roxzone) == null) ||
      (total.trim() && parseClock(total) == null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) {
      onToast("Pick the date of the race or simulation.");
      return;
    }
    if (bad) {
      onToast("Times are h:mm:ss, mm:ss or seconds.");
      return;
    }
    setBusy("result");
    try {
      const data = await call("/api/race-results", "POST", {
        kind,
        held_on: heldOn,
        label: label.trim() || null,
        is_baseline: baseline,
        total_sec: total.trim() ? parseClock(total) : null,
        runs_sec: runSec,
        stations_sec: stationSec,
        roxzone_sec: roxzone.trim() ? parseClock(roxzone) : null,
      });
      onToast(`Saved — ${fmtClock(data.total_sec)}. The analysis is on Progress.`);
      setLabel("");
      setTotal("");
      setBaseline(false);
      setRuns(Array(8).fill(""));
      setStations(Array(8).fill(""));
      setRoxzone("");
      onSaved();
    } catch (e) {
      const msg = (e as Error).message;
      onToast(msg === "total_required" ? "Enter the total time, or every split including the roxzone." : msg);
    } finally {
      setBusy(null);
    }
  }

  async function makeBaseline(id: string) {
    setBusy(id);
    try {
      await call("/api/race-results", "PATCH", { id, is_baseline: true });
      onToast("Baseline set.");
      onSaved();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await call(`/api/race-results?id=${id}`, "DELETE");
      onToast("Result deleted.");
      onSaved();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const sorted = [...results].sort((a, b) => b.held_on.localeCompare(a.held_on));

  return (
    <div className="card space-y-4" data-testid="race-results-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Races &amp; simulations</h3>
        {targetTimeSec && <span className="pill text-amber">target {fmtClock(targetTimeSec)}</span>}
      </div>
      <p className="text-xs text-ash">
        Every split you time here feeds the race analysis on Progress: target split per segment,
        gap, readiness from your baseline, and the pace you lose after the burpee broad jumps.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-ash">
          Target time
          <input
            className="input mt-1 w-32"
            placeholder="e.g. 1:09:59"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <button className="btn-ghost shrink-0" disabled={busy === "target"} onClick={saveTarget}>
          {busy === "target" ? "…" : "Set"}
        </button>
      </div>

      <details className="rounded-lg border border-edge p-3">
        <summary className="cursor-pointer text-sm font-semibold">Add a race or simulation</summary>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-36"
              value={kind}
              onChange={(e) => setKind(e.target.value as "simulation" | "race")}
              aria-label="Kind"
            >
              <option value="simulation">Simulation</option>
              <option value="race">Race</option>
            </select>
            <input
              className="input w-40"
              type="date"
              value={heldOn}
              onChange={(e) => setHeldOn(e.target.value)}
              aria-label="Date"
            />
            <input
              className="input min-w-0 flex-1"
              placeholder="Label, e.g. Rome"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Race order: run, station, run, station … */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATIONS.map((st, i) => (
              <div key={st} className="contents">
                <SplitInput
                  label={`Run ${i + 1}`}
                  value={runs[i]}
                  onChange={(v) => setRuns((xs) => xs.map((x, j) => (j === i ? v : x)))}
                />
                <SplitInput
                  label={STATION_LABELS[st]}
                  value={stations[i]}
                  onChange={(v) => setStations((xs) => xs.map((x, j) => (j === i ? v : x)))}
                />
              </div>
            ))}
            <SplitInput label="Roxzone (total)" value={roxzone} onChange={setRoxzone} />
            <SplitInput label="Total time" value={total} onChange={setTotal} placeholder="sum if empty" />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={baseline} onChange={(e) => setBaseline(e.target.checked)} />
            This is my baseline — the race my target is measured from
          </label>

          <button className="btn-primary" disabled={busy === "result"} onClick={saveResult}>
            {busy === "result" ? "…" : "Save result"}
          </button>
        </div>
      </details>

      {sorted.length > 0 && (
        <ul className="divide-y divide-edge text-sm">
          {sorted.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-mono tabular-nums">{fmtClock(r.total_sec)}</span>{" "}
                <span className="text-ash">
                  · {r.kind} · {r.held_on}
                  {r.label ? ` · ${r.label}` : ""}
                </span>
                {r.is_baseline && <span className="pill ml-2 text-amber">baseline</span>}
              </span>
              <span className="flex gap-2">
                {!r.is_baseline && (
                  <button className="btn-ghost text-xs" disabled={busy === r.id} onClick={() => makeBaseline(r.id)}>
                    Make baseline
                  </button>
                )}
                <button className="btn-ghost text-xs" disabled={busy === r.id} onClick={() => remove(r.id)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SplitInput({
  label,
  value,
  onChange,
  placeholder = "m:ss",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-xs text-ash">
      {label}
      <input
        className="input mt-1 w-full"
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
