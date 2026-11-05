"use client";

import { useState } from "react";
import { slimBackup } from "@/lib/import/hyroxTraining";
import { SpinnerIcon } from "./icons";

const SKIP_LABEL: Record<string, string> = {
  simulation_without_all_splits: "simulations without all 16 splits (kept as history only)",
  record_not_a_station_benchmark: "running / roxzone totals (not a station benchmark)",
  wall_balls_not_after_a_sequence: "wall-ball times not taken after a HYROX sequence",
  workout_without_id_date_or_kind: "workouts without a date or type",
  record_without_id_date_or_time: "records without a date or time",
};

interface Result {
  found: { workouts: number; races: number; benchmarks: number };
  added: { workouts: number; races: number; benchmarks: number };
  skipped: Record<string, number>;
}

/**
 * Import the JSON backup of the single-file HyroxTraining tracker. The file
 * is read and slimmed in the browser; the server maps and stores it.
 */
export function ImportCard({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let slim;
      try {
        slim = slimBackup(JSON.parse(await file.text()));
      } catch {
        throw new Error("That file is not a HyroxTraining backup (menu → Export in the tracker).");
      }
      const res = await fetch("/api/import/hyroxtraining", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(slim),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "Import failed.");
      setResult(data as Result);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3" data-testid="import-card">
      <div className="text-lead font-semibold">Import from HyroxTraining</div>
      <p className="max-w-[62ch] text-meta leading-relaxed text-ash">
        Choose the JSON backup from the tracker (menu → Export). Finished workouts become your
        training history, full simulations land under Races &amp; simulations, station times under
        Benchmarks. Importing the same file again adds only what is new. Your plan does not change.
      </p>
      <label className="btn-ghost inline-flex cursor-pointer items-center gap-2">
        {busy ? <SpinnerIcon size={16} /> : null}
        {busy ? "Importing…" : "Choose backup file"}
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {error && <p className="text-meta text-stop">{error}</p>}

      {result && (
        <div className="space-y-1 text-meta" data-testid="import-result">
          <p className="text-bone">
            Added {result.added.workouts} workouts, {result.added.races} simulations,{" "}
            {result.added.benchmarks} station benchmarks.
            {result.found.workouts - result.added.workouts > 0 &&
              ` ${result.found.workouts - result.added.workouts} workouts were already here.`}
          </p>
          {Object.entries(result.skipped).map(([k, n]) => (
            <p key={k} className="text-ash">
              Not imported: {n} {SKIP_LABEL[k] ?? k}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
