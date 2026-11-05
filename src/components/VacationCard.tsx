"use client";

import { useState } from "react";
import { CalendarIcon, SpinnerIcon } from "./icons";

export interface VacationRow {
  id: string;
  starts_on: string;
  ends_on: string;
  mode: "maintain" | "off";
  note: string | null;
}

const fmt = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/**
 * Vacations on the setup page. Adding or removing one rebuilds the remaining
 * weeks (POST / DELETE /api/vacations).
 */
export function VacationCard({
  vacations,
  hasPlan,
  onToast,
  onChanged,
}: {
  vacations: VacationRow[];
  hasPlan: boolean;
  onToast: (msg: string) => void;
  onChanged: () => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState<"maintain" | "off">("maintain");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function add() {
    if (!start || !end) {
      onToast("Pick the first and the last day away.");
      return;
    }
    setBusy("add");
    try {
      const res = await fetch("/api/vacations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ starts_on: start, ends_on: end, mode, note: note.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "Could not save the vacation.");
      onToast(data.rebased ? "Vacation saved — the remaining weeks were rebuilt around it." : "Vacation saved — your next plan uses it.");
      setStart("");
      setEnd("");
      setNote("");
      onChanged();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/vacations?id=${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "Could not remove it.");
      onToast("Vacation removed — those days are training days again.");
      onChanged();
    } catch (e) {
      onToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card space-y-4" data-testid="vacation-card">
      <div className="flex items-center gap-2">
        <CalendarIcon size={16} className="text-amber" />
        <span className="text-lead font-semibold">Vacation</span>
      </div>
      <p className="max-w-[62ch] text-meta leading-relaxed text-ash">
        Days you are away. <b className="text-bone">Keep it ticking</b>: easy runs, one optional
        quality run, bodyweight — no stations, sled or game days. <b className="text-bone">Fully off</b>:
        nothing planned. The race date stays; the simulation and benchmarks move out of the
        vacation, and the week you come back in is lighter.
      </p>

      {vacations.length > 0 && (
        <ul className="divide-y divide-edge text-meta">
          {vacations.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <span className="font-mono tabular-nums text-bone">
                  {fmt(v.starts_on)} – {fmt(v.ends_on)}
                </span>{" "}
                <span className="text-ash">
                  · {v.mode === "off" ? "fully off" : "keep it ticking"}
                  {v.note ? ` · ${v.note}` : ""}
                </span>
              </span>
              <button className="btn-ghost text-xs" disabled={busy !== null} onClick={() => remove(v.id)}>
                {busy === v.id ? "…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid max-w-xl gap-3 sm:grid-cols-2">
        <label>
          <span className="label">First day away</span>
          <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label>
          <span className="label">Last day away</span>
          <input className="input" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Vacation mode">
        {(
          [
            ["maintain", "Keep it ticking"],
            ["off", "Fully off"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="radio"
            aria-checked={mode === id}
            onClick={() => setMode(id)}
            className={`rounded-control border px-3 py-1.5 text-meta font-semibold ${
              mode === id ? "border-amber/70 bg-amber/15 text-chalk" : "border-edge text-ash hover:border-edge-strong"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        className="input max-w-xl"
        placeholder="Note (optional), e.g. Teneriffa"
        maxLength={80}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-4">
        <button className="btn-ghost" disabled={busy !== null} onClick={() => void add()}>
          {busy === "add" ? <SpinnerIcon size={16} /> : <CalendarIcon size={16} />}
          Add vacation
        </button>
        <span className="text-micro text-ash">
          {hasPlan ? "Rebuilds the remaining weeks." : "Applies to your next plan."}
        </span>
      </div>
    </div>
  );
}
