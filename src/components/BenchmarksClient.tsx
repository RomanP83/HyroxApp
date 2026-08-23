"use client";

import { useState } from "react";
import { AppHeader } from "./AppHeader";
import { useRouter } from "next/navigation";
import { fmtClock } from "@/lib/format";
import { TargetIcon } from "./icons";

export interface BenchmarkDef {
  id: string;
  slug: string;
  name: string;
  metric_type: "time_sec" | "reps" | "distance_m";
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
  return metric === "time_sec" ? fmtClock(v) : String(v);
}

export function BenchmarksClient({
  defs,
  entries,
  predicted,
}: {
  defs: BenchmarkDef[];
  entries: BenchmarkEntry[];
  predicted: number | null;
}) {
  const router = useRouter();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function save(def: BenchmarkDef) {
    const value = parseValue(inputs[def.slug] ?? "", def.metric_type);
    if (value == null) {
      setToast(`Enter a valid value for ${def.name} (${UNIT[def.metric_type]}).`);
      return;
    }
    setBusy(def.slug);
    try {
      const res = await fetch("/api/benchmarks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: def.slug, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
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

      <div className="grid gap-4 sm:grid-cols-2">
        {defs.map((def) => {
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
