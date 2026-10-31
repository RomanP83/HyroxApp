"use client";

import { useState } from "react";
import { AppHeader } from "./AppHeader";
import { useRouter } from "next/navigation";
import { fmtClock } from "@/lib/format";
import { TargetIcon } from "./icons";
import {
  ATPT_RECOVERY_SLUG,
  ATPT_WATTS_SLUG,
  HR_MAX_MAX,
  HR_MAX_MIN,
  atPtTargets,
} from "@/lib/atpt";

export interface BenchmarkDef {
  id: string;
  slug: string;
  name: string;
  metric_type: "time_sec" | "reps" | "distance_m" | "watts";
  protocol: string | null;
}

export interface BenchmarkEntry {
  benchmark_id: string;
  value: number;
  phase_context: string;
  recorded_at: string;
}

const UNIT: Record<BenchmarkDef["metric_type"], string> = {
  time_sec: "mm:ss or seconds",
  reps: "reps",
  distance_m: "meters",
  watts: "watts",
};

/** Accept "mm:ss" or plain numbers for time benchmarks. */
function parseValue(raw: string, metric: BenchmarkDef["metric_type"]): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (metric === "time_sec" && trimmed.includes(":")) {
    const [m, s] = trimmed.split(":").map(Number);
    if (Number.isFinite(m) && Number.isFinite(s)) return m * 60 + s;
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fmtValue(v: number, metric: BenchmarkDef["metric_type"]): string {
  if (metric === "time_sec") return fmtClock(v);
  if (metric === "watts") return `${Math.round(v)} W`;
  return String(v);
}

async function postBenchmark(slug: string, value: number) {
  const res = await fetch("/api/benchmarks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, value }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "save failed");
  return data as { predicted_race_time_sec?: number };
}

export function BenchmarksClient({
  defs,
  entries,
  predicted,
  hrMax,
}: {
  defs: BenchmarkDef[];
  entries: BenchmarkEntry[];
  predicted: number | null;
  hrMax: number | null;
}) {
  const router = useRouter();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const atptWatts = defs.find((d) => d.slug === ATPT_WATTS_SLUG);
  const atptRecovery = defs.find((d) => d.slug === ATPT_RECOVERY_SLUG);
  const gridDefs = defs.filter((d) => d !== atptWatts && d !== atptRecovery);

  async function save(def: BenchmarkDef) {
    const value = parseValue(inputs[def.slug] ?? "", def.metric_type);
    if (value == null) {
      setToast(`Enter a valid value for ${def.name} (${UNIT[def.metric_type]}).`);
      return;
    }
    setBusy(def.slug);
    try {
      const data = await postBenchmark(def.slug, value);
      setToast(
        data.predicted_race_time_sec
          ? `Saved. Estimated finish is now ${fmtClock(data.predicted_race_time_sec)}.`
          : "Saved.",
      );
      setInputs((m) => ({ ...m, [def.slug]: "" }));
      router.refresh();
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="space-y-6">
      <AppHeader />
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-h1 font-bold tracking-tight">Benchmarks</h1>
        <span className="pill">start / mid / pre-race</span>
      </div>
      <p className="max-w-2xl text-ash">
        Re-testing 1–2 key efforts makes progress provable — and every result recalibrates your
        pace zones and finish-time estimate on real numbers, not guesses.
      </p>

      <div className="card flex items-center justify-between">
        <div>
          <div className="text-sm text-ash">Estimated finish</div>
          <div className="text-3xl font-bold">{fmtClock(predicted)}</div>
        </div>
        <div className="max-w-[220px] text-right text-xs text-ash">
          Updates the moment you save a benchmark below.
        </div>
      </div>

      {atptWatts && atptRecovery && (
        <AtPtCard
          wattsDef={atptWatts}
          recoveryDef={atptRecovery}
          entries={entries}
          hrMax={hrMax}
          onToast={setToast}
          onSaved={() => router.refresh()}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {gridDefs.map((def) => {
          const history = entries.filter((e) => e.benchmark_id === def.id);
          const latest = history[0];
          return (
            <div key={def.id} className="card space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{def.name}</h3>
                  {latest && (
                    <span className="pill text-amber">
                      last: {fmtValue(latest.value, def.metric_type)}
                    </span>
                  )}
                </div>
                {def.protocol && <p className="mt-1 text-xs text-ash">{def.protocol}</p>}
              </div>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder={UNIT[def.metric_type]}
                  value={inputs[def.slug] ?? ""}
                  onChange={(e) => setInputs((m) => ({ ...m, [def.slug]: e.target.value }))}
                />
                <button
                  className="btn-primary shrink-0"
                  disabled={busy === def.slug}
                  onClick={() => save(def)}
                >
                  {busy === def.slug ? "…" : "Save"}
                </button>
              </div>
              {history.length > 1 && (
                <div className="text-xs text-ash">
                  {history.slice(0, 3).map((h) => (
                    <span key={h.recorded_at} className="mr-3">
                      {fmtValue(h.value, def.metric_type)} · {h.phase_context}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toast && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-edge bg-lane px-4 py-2 text-sm shadow-lg animate-fade-up"
          onClick={() => setToast(null)}
        >
          <span className="flex items-center gap-2"><TargetIcon size={14} className="shrink-0 text-amber" />{toast}</span>
        </div>
      )}
    </main>
  );
}

/**
 * The threshold trial gets one card for its two numbers: they come out of the
 * same five minutes and mean little apart. The heart-rate targets are worked
 * out from the athlete's own maximum, which is set right here.
 */
function AtPtCard({
  wattsDef,
  recoveryDef,
  entries,
  hrMax,
  onToast,
  onSaved,
}: {
  wattsDef: BenchmarkDef;
  recoveryDef: BenchmarkDef;
  entries: BenchmarkEntry[];
  hrMax: number | null;
  onToast: (msg: string) => void;
  onSaved: () => void;
}) {
  const [hrInput, setHrInput] = useState(hrMax != null ? String(hrMax) : "");
  const [watts, setWatts] = useState("");
  const [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState<"hr" | "result" | null>(null);

  const t = atPtTargets(hrMax);
  const wattsHistory = entries.filter((e) => e.benchmark_id === wattsDef.id);
  const recoveryHistory = entries.filter((e) => e.benchmark_id === recoveryDef.id);

  async function saveHrMax() {
    const raw = hrInput.trim();
    const value = raw === "" ? null : Number(raw);
    if (value != null && !(Number.isInteger(value) && value >= HR_MAX_MIN && value <= HR_MAX_MAX)) {
      onToast(`Max heart rate must be a whole number between ${HR_MAX_MIN} and ${HR_MAX_MAX}.`);
      return;
    }
    setBusy("hr");
    try {
      const res = await fetch("/api/profile/hr-max", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hr_max: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      onToast(value == null ? "Max heart rate cleared." : `Max heart rate set to ${value} bpm.`);
      onSaved();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveResult() {
    const w = parseValue(watts, "watts");
    const r = parseValue(recovery, "time_sec");
    if (w == null && r == null) {
      onToast("Enter the average watts, the recovery time, or both.");
      return;
    }
    if ((watts.trim() && w == null) || (recovery.trim() && r == null)) {
      onToast("Watts are a number; recovery is mm:ss or seconds.");
      return;
    }
    setBusy("result");
    try {
      if (w != null) await postBenchmark(wattsDef.slug, w);
      if (r != null) await postBenchmark(recoveryDef.slug, r);
      onToast("AT-PT saved.");
      setWatts("");
      setRecovery("");
      onSaved();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card space-y-4" data-testid="atpt-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">AT-PT · threshold trial on the erg</h3>
        <div className="flex gap-2">
          {wattsHistory[0] && (
            <span className="pill text-amber">{fmtValue(wattsHistory[0].value, "watts")}</span>
          )}
          {recoveryHistory[0] && (
            <span className="pill text-amber">↓ {fmtClock(recoveryHistory[0].value)}</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-ash">
          Max heart rate (bpm)
          <input
            className="input mt-1 w-28"
            inputMode="numeric"
            placeholder="e.g. 190"
            value={hrInput}
            onChange={(e) => setHrInput(e.target.value)}
          />
        </label>
        <button className="btn-ghost shrink-0" disabled={busy === "hr"} onClick={saveHrMax}>
          {busy === "hr" ? "…" : "Set"}
        </button>
      </div>

      {t ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Same erg every time (SkiErg or RowErg, same damper), rested, chest strap on.</li>
          <li>Warm up 10 min, building to about <b>{t.warmupTo} bpm</b>.</li>
          <li>
            Raise the effort until your heart rate sits at <b>{t.holdLow}–{t.holdHigh} bpm</b>, then
            hold that band for <b>5:00</b> — adjust the pace, not the band. Note the average watts of
            those five minutes.
          </li>
          <li>
            Stop and stand still. Time how long your heart rate takes to fall to{" "}
            <b>{t.recoveryTo} bpm</b>.
          </li>
        </ol>
      ) : (
        <p className="text-sm text-ash">
          Set your max heart rate and the trial shows its targets: a hold band at about 87 % of it,
          and the recovery mark at two thirds.
        </p>
      )}
      <p className="text-xs text-ash">
        More watts in the same band, or a faster way down, means the engine got better. Compare
        only trials on the same machine.
      </p>

      <div className="flex flex-wrap gap-2">
        <input
          className="input w-32"
          inputMode="numeric"
          placeholder="avg watts"
          value={watts}
          onChange={(e) => setWatts(e.target.value)}
        />
        <input
          className="input w-40"
          placeholder={t ? `time to ${t.recoveryTo} (mm:ss)` : "recovery (mm:ss)"}
          value={recovery}
          onChange={(e) => setRecovery(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={busy === "result"} onClick={saveResult}>
          {busy === "result" ? "…" : "Save"}
        </button>
      </div>

      {(wattsHistory.length > 1 || recoveryHistory.length > 1) && (
        <div className="space-y-1 text-xs text-ash">
          {wattsHistory.length > 1 && (
            <div>
              {wattsHistory.slice(0, 3).map((h) => (
                <span key={h.recorded_at} className="mr-3">
                  {fmtValue(h.value, "watts")} · {h.phase_context}
                </span>
              ))}
            </div>
          )}
          {recoveryHistory.length > 1 && (
            <div>
              {recoveryHistory.slice(0, 3).map((h) => (
                <span key={h.recorded_at} className="mr-3">
                  ↓ {fmtClock(h.value)} · {h.phase_context}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
