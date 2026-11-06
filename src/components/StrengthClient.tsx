"use client";

// ============================================================================
// Strength programming the athlete owns: import the sheet they already keep,
// see what the parser made of it BEFORE saving, adjust a weight, and answer
// the progression suggestions the engine leaves after a logged session.
// ============================================================================
import { AppHeader } from "./AppHeader";
import { useState } from "react";
import { readApi } from "@/lib/apiResult";
import { useRouter } from "next/navigation";
import { CheckIcon, SkipIcon, SparkIcon, SpinnerIcon } from "./icons";

export interface StrengthExercise {
  id: string;
  position: number;
  name: string;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  load_kg: number | null;
  superset_group: string | null;
  suggested_load_kg: number | null;
  suggested_reason: string | null;
}

export interface StrengthTemplate {
  id: string;
  name: string;
  sort_order: number;
  strength_exercises: StrengthExercise[];
}

interface PreviewExercise {
  position: number;
  name: string;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  load_kg: number | null;
  superset_group: string | null;
  last_set_reps: number[];
}

const EXAMPLE = `\tTag A: Oberkörper\tSätze\tWiederholungen\tGewicht\tSatz 1\tSatz 2
1\tBankdrücken mit KH\t2\t6 - 8\t22\t12\t8
2\tRuderzug (Breit oder Eng)\t2\t6 - 8\t85\t10\t9`;

export function reps(e: { rep_min: number | null; rep_max: number | null }): string {
  if (e.rep_min == null && e.rep_max == null) return "—";
  if (e.rep_min === e.rep_max) return `${e.rep_min}`;
  return `${e.rep_min ?? "?"}–${e.rep_max ?? "?"}`;
}

export function load(e: { load_kg: number | null }): string {
  return e.load_kg == null ? "bodyweight" : `${e.load_kg} kg`;
}

export function StrengthClient({ templates }: { templates: StrengthTemplate[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<{ name: string | null; exercises: PreviewExercise[]; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function call(init: RequestInit) {
    const res = await fetch("/api/strength/templates", {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    const out = await readApi(res);
    if (!out.ok) throw new Error(out.message);
    const data = out.data as Record<string, any>;
    return data;
  }

  async function runPreview() {
    setBusy("preview");
    try {
      const data = await call({ method: "POST", body: JSON.stringify({ text, preview: true }) });
      setPreview({ name: data.name, exercises: data.exercises, warnings: data.warnings });
      if (!name && data.name) setName(data.name);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "could not read that");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    try {
      const data = await call({ method: "POST", body: JSON.stringify({ text, name: name || undefined }) });
      setToast(`Imported "${data.template.name}" — ${data.exercises} exercises.`);
      setText("");
      setName("");
      setPreview(null);
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "import failed");
    } finally {
      setBusy(null);
    }
  }

  async function patch(exerciseId: string, action: string, loadKg?: number | null) {
    setBusy(exerciseId);
    try {
      await call({
        method: "PATCH",
        body: JSON.stringify({ exercise_id: exerciseId, action, load_kg: loadKg }),
      });
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "could not save that");
    } finally {
      setBusy(null);
    }
  }

  async function remove(templateId: string, templateName: string) {
    if (!window.confirm(`Delete "${templateName}"? The logged sets stay.`)) return;
    setBusy(templateId);
    try {
      const res = await fetch(`/api/strength/templates?template=${templateId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await readApi(res)).message);
      setToast(`"${templateName}" deleted.`);
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "delete failed");
    } finally {
      setBusy(null);
    }
  }

  const openSuggestions = templates.flatMap((t) =>
    t.strength_exercises.filter((e) => e.suggested_load_kg != null).map((e) => ({ template: t, exercise: e })),
  );

  return (
    <main className="space-y-6">
      <AppHeader />
      <div>
        <h1 className="text-h1 font-bold tracking-tight">Your strength days</h1>
        <p className="mt-1 max-w-[62ch] text-meta leading-relaxed text-ash">
          Your exercises, your kilos, your rep ranges — imported from the sheet you already keep.
          The plan uses them for every strength session.
        </p>
      </div>

      {/* ── Open progression suggestions ───────────────────────────────── */}
      {openSuggestions.length > 0 && (
        <div className="card space-y-3 border-flame/50">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SparkIcon size={16} className="text-amber" /> Ready to go up
          </div>
          {openSuggestions.map(({ template, exercise }) => (
            <div
              key={exercise.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge bg-rack p-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {exercise.name}{" "}
                  <span className="font-mono text-amber">
                    {load(exercise)} → {exercise.suggested_load_kg} kg
                  </span>
                </div>
                <div className="text-xs text-ash">
                  {template.name} · {exercise.suggested_reason}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-primary"
                  disabled={busy === exercise.id}
                  onClick={() => void patch(exercise.id, "accept_suggestion")}
                >
                  {busy === exercise.id ? <SpinnerIcon size={16} /> : <CheckIcon size={16} />}
                  Take it
                </button>
                <button
                  className="btn-ghost"
                  disabled={busy === exercise.id}
                  onClick={() => void patch(exercise.id, "dismiss_suggestion")}
                >
                  <SkipIcon size={16} />
                  Keep {load(exercise)}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Import ─────────────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <div className="text-sm font-semibold">Import a day from Excel</div>
        <p className="text-xs text-ash">
          Select the rows in your sheet, copy, paste here. Tabs, semicolons and commas all work —
          rep ranges (&quot;6 - 8&quot;), supersets and bodyweight rows are read as they are.
        </p>
        <textarea
          className="input min-h-[160px] font-mono text-xs"
          value={text}
          placeholder={EXAMPLE}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" disabled={!text.trim() || busy === "preview"} onClick={() => void runPreview()}>
            {busy === "preview" ? <SpinnerIcon size={16} /> : <SparkIcon size={16} />}
            Read it
          </button>
          {preview && (
            <>
              <input
                className="input max-w-xs"
                value={name}
                placeholder="Name for this day"
                onChange={(e) => setName(e.target.value)}
              />
              <button className="btn-primary" disabled={busy === "save"} onClick={() => void save()}>
                {busy === "save" ? <SpinnerIcon size={16} /> : <CheckIcon size={16} />}
                Save this day
              </button>
            </>
          )}
        </div>

        {preview && (
          <div className="space-y-2 rounded-lg border border-edge bg-rack p-3">
            <div className="text-xs font-semibold">
              {preview.exercises.length} exercises — check before saving
            </div>
            <ul className="space-y-1 text-xs">
              {preview.exercises.map((e) => (
                <li key={e.position} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-ash">
                    {e.sets}× {reps(e)} · {load(e)}
                    {e.superset_group ? ` · superset ${e.superset_group}` : ""}
                    {e.last_set_reps.length ? ` · last: ${e.last_set_reps.join(", ")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {preview.warnings.length > 0 && (
              <ul className="space-y-1 border-t border-edge pt-2 text-[11px] text-amber">
                {preview.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── The days themselves ────────────────────────────────────────── */}
      {templates.length === 0 ? (
        <div className="card text-sm text-ash">
          No strength day yet — paste one above and every strength session in your plan will use it.
        </div>
      ) : (
        templates.map((t, i) => (
          <div key={t.id} className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="pill">{String.fromCharCode(65 + i)}</span>
                <span className="font-semibold">{t.name}</span>
                <span className="text-xs text-ash">{t.strength_exercises.length} exercises</span>
              </div>
              <button className="btn-ghost" disabled={busy === t.id} onClick={() => void remove(t.id, t.name)}>
                <SkipIcon size={16} />
                Delete
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              {[...t.strength_exercises]
                .sort((a, b) => a.position - b.position)
                .map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge bg-rack p-2"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="font-medium">{e.name}</span>
                      {e.superset_group && <span className="pill">SS {e.superset_group}</span>}
                      <span className="text-xs text-ash">
                        {e.sets}× {reps(e)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <input
                        className="input w-24 text-right font-mono"
                        type="number"
                        step="0.5"
                        min="0"
                        defaultValue={e.load_kg ?? ""}
                        placeholder="BW"
                        aria-label={`Weight for ${e.name}`}
                        onBlur={(ev) => {
                          const raw = ev.target.value.trim();
                          const next = raw === "" ? null : Number(raw);
                          if (next === (e.load_kg ?? null)) return;
                          void patch(e.id, "set_load", next);
                        }}
                      />
                      <span className="text-xs text-ash">kg</span>
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}

      {toast && (
        <div
          className="fixed bottom-4 left-1/2 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-lg border border-edge bg-lane px-4 py-2 text-sm shadow-lg"
          onClick={() => setToast(null)}
        >
          <SparkIcon size={14} className="shrink-0 text-amber" />
          {toast}
        </div>
      )}
    </main>
  );
}
