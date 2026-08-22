"use client";

import { useState } from "react";
import type { GeneratedSession } from "@/lib/engine";
import { runSpec } from "@/lib/engine";
import { fmtPace } from "@/lib/format";
import { BlockView } from "./BlockView";
import { titleCase } from "@/lib/format";
import {
  CheckIcon,
  FlameIcon,
  FeatherIcon,
  SkipIcon,
  LockIcon,
  SpinnerIcon,
  UndoIcon,
} from "./icons";
import { haptic } from "@/lib/haptics";

const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type LogAction = "planned" | "harder" | "easier" | "skip";

/** One exercise of the athlete's own strength day, ready to be filled in. */
export interface StrengthExerciseInput {
  id: string;
  name: string;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  load_kg: number | null;
  superset_group: string | null;
}

export interface StrengthSetInput {
  exercise_id: string;
  exercise_name: string;
  set_number: number;
  reps: number | null;
  load_kg: number | null;
}

interface Props {
  session: GeneratedSession;
  /** When provided, renders the 4-button quick-log row. */
  onLog?: (action: LogAction, strengthSets?: StrengthSetInput[]) => void;
  /**
   * The athlete's own strength day for this session. Turns the card into a
   * fillable sheet: reps and kilos per set, sent along with the quick-log tap.
   */
  strength?: { templateName: string; exercises: StrengthExerciseInput[] } | null;
  status?: "planned" | "done" | "skipped" | "moved";
  locked?: boolean;
  /** Which action is in flight — shows a spinner on that button (speed #6). */
  busyAction?: LogAction | null;
  /**
   * Undo this day (mis-tap on As planned / Harder / Easier / Skip). When set,
   * a logged or skipped card offers "Undo" — the log, and the calibration it
   * caused, are rolled back and the quick-log row comes back.
   */
  onReset?: () => void;
  /** Reset request in flight — swaps the undo icon for a spinner. */
  resetting?: boolean;
  /**
   * Show the AM/PM marker. Only meaningful on a double day, so the caller —
   * which sees the whole week — decides.
   */
  showSlot?: boolean;
}

/** The variant the engine chose for this week's core session, if any. */
function variantOf(session: GeneratedSession) {
  const block = session.blocks.find((b) => b.load_adjustments.variant_name);
  if (!block) return null;
  const a = block.load_adjustments;
  return {
    name: a.variant_name!,
    why: a.variant_why,
    fallback: a.variant_fallback,
    targeted: a.variant_targeted,
  };
}

/** The pace targets the plan wrote into this session's main block, if any. */
function pacesOf(session: GeneratedSession): {
  pace?: number;
  opening?: number;
  openingDistance?: number;
} {
  const block = session.blocks.find((b) => b.load_adjustments.pace_sec_km != null);
  return {
    pace: block?.load_adjustments.pace_sec_km,
    opening: block?.load_adjustments.opening_pace_sec_km,
    openingDistance: block?.load_adjustments.opening_distance_m,
  };
}

export function SessionCard({
  session,
  onLog,
  status = "planned",
  locked,
  busyAction,
  onReset,
  resetting,
  showSlot,
  strength,
}: Props) {
  const [open, setOpen] = useState(false);
  // Keyed "<exerciseId>:<setNumber>" — only what the athlete actually typed.
  const [entries, setEntries] = useState<Record<string, { reps?: number; load?: number }>>({});
  const isRest = session.session_type === "rest";

  function collectSets(): StrengthSetInput[] | undefined {
    if (!strength) return undefined;
    const out: StrengthSetInput[] = [];
    for (const exercise of strength.exercises) {
      for (let setNumber = 1; setNumber <= exercise.sets; setNumber++) {
        const entry = entries[`${exercise.id}:${setNumber}`];
        if (!entry || (entry.reps == null && entry.load == null)) continue;
        out.push({
          exercise_id: exercise.id,
          exercise_name: exercise.name,
          set_number: setNumber,
          reps: entry.reps ?? null,
          // An empty weight field means "as programmed".
          load_kg: entry.load ?? exercise.load_kg,
        });
      }
    }
    return out.length ? out : undefined;
  }

  function press(action: LogAction) {
    haptic(action === "planned" ? "confirm" : "tap");
    onLog?.(action, action === "skip" ? undefined : collectSets());
  }

  function pressReset() {
    haptic("tap");
    onReset?.();
  }

  const logged = status === "done" || status === "skipped";

  const LogButton = ({
    action,
    icon,
    label,
    hint,
    primary,
  }: {
    action: LogAction;
    icon: React.ReactNode;
    label: string;
    /** What the tap actually reports — the labels alone read as a wish. */
    hint?: string;
    primary?: boolean;
  }) => (
    <button
      className={primary ? "btn-primary" : "btn-ghost"}
      onClick={() => press(action)}
      disabled={busyAction != null}
      title={hint}
    >
      {busyAction === action ? <SpinnerIcon size={16} /> : icon}
      {label}
    </button>
  );

  return (
    <div className="card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="pill">
              {DAY_LABELS[session.day_hint] ?? `D${session.day_hint}`}
              {showSlot && (
                <span className="ml-1 font-bold text-accent2">
                  {(session.day_slot ?? "am").toUpperCase()}
                </span>
              )}
            </span>
            <span className="font-semibold">{session.title}</span>
            {status === "done" && <CheckIcon size={16} className="text-ok" />}
            {status === "skipped" && <span className="text-xs text-muted">skipped</span>}
            {status === "moved" && <span className="pill">moved</span>}
          </div>
          <div className="mt-1 text-xs text-muted">
            {titleCase(session.session_type)} · {session.planned_duration_min} min · RPE target{" "}
            {session.intensity_rpe_target}/10
          </div>
          {(() => {
            // Running is 50-60% of the race: a run session says which zone it
            // is for and at what pace, not just how long it is.
            const spec = runSpec(session.session_type);
            if (!spec) return null;
            const { pace, opening, openingDistance } = pacesOf(session);
            const variant = variantOf(session);
            return (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                {/* Which shape of the core session this week gets. */}
                {variant && (
                  <span className="pill border-accent/60 text-ink">
                    {variant.name}
                    {variant.targeted && <span className="ml-1 text-accent">· your weak spot</span>}
                  </span>
                )}
                <span className="pill text-accent2">{spec.hr_zone}</span>
                {pace != null && <span className="pill">{fmtPace(pace)}</span>}
                {/* Coming out of a station you run slower on purpose — that
                    belongs on the front of the card, not one tap deeper. */}
                {opening != null && (
                  <span className="pill">
                    first {openingDistance} m: {fmtPace(opening)}
                  </span>
                )}
                <span className="text-muted">{spec.distance_hint}</span>
              </div>
            );
          })()}
        </div>
        <span
          className={`text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          ▸
        </span>
      </button>

      {open && !isRest && (
        <div className="mt-4 space-y-2 animate-fade-up">
          {locked ? (
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-line p-4 text-sm text-muted">
              <LockIcon size={18} className="mt-0.5 shrink-0" />
              <span>
                This week is part of your full race cycle. Unlock it to see every block, weight
                and pace — week 1 stays free forever.
              </span>
            </div>
          ) : (
            <>
              {session.blocks.map((b) => (
                <BlockView key={`${b.block_id}-${b.sort_order}`} block={b} />
              ))}
              {(() => {
                const spec = runSpec(session.session_type);
                const variant = variantOf(session);
                if (!spec) return null;
                return (
                  <div className="space-y-1 px-1 text-xs text-muted">
                    {variant?.why && (
                      <p>
                        <b className="text-ink">{variant.name}:</b> {variant.why}
                      </p>
                    )}
                    <p>
                      <b>{spec.focus}</b> {spec.pace_note}
                    </p>
                    {variant?.fallback && <p className="italic">{variant.fallback}</p>}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {strength && onLog && !isRest && (status === "planned" || status === "moved") && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold">{strength.templateName}</span>
            <span className="text-muted">reps · kg per set</span>
          </div>
          {strength.exercises.map((exercise) => (
            <div key={exercise.id} className="rounded-lg border border-line bg-surface2 p-2">
              <div className="mb-1 flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-medium">{exercise.name}</span>
                {exercise.superset_group && <span className="pill">SS {exercise.superset_group}</span>}
                <span className="text-xs text-muted">
                  {exercise.sets}×{" "}
                  {exercise.rep_min === exercise.rep_max
                    ? exercise.rep_min ?? "—"
                    : `${exercise.rep_min ?? "?"}–${exercise.rep_max ?? "?"}`}{" "}
                  · {exercise.load_kg == null ? "bodyweight" : `${exercise.load_kg} kg`}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: exercise.sets }, (_, i) => i + 1).map((setNumber) => (
                  <span key={setNumber} className="flex items-center gap-1">
                    <span className="text-[10px] text-muted">S{setNumber}</span>
                    <input
                      className="input w-14 px-2 py-1 text-right font-mono text-xs"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      placeholder={String(exercise.rep_max ?? exercise.rep_min ?? "")}
                      aria-label={`${exercise.name} set ${setNumber} reps`}
                      onChange={(e) =>
                        setEntries((m) => ({
                          ...m,
                          [`${exercise.id}:${setNumber}`]: {
                            ...m[`${exercise.id}:${setNumber}`],
                            reps: e.target.value === "" ? undefined : Number(e.target.value),
                          },
                        }))
                      }
                    />
                    <input
                      className="input w-16 px-2 py-1 text-right font-mono text-xs"
                      type="number"
                      min="0"
                      step="0.5"
                      inputMode="decimal"
                      placeholder={exercise.load_kg == null ? "BW" : String(exercise.load_kg)}
                      aria-label={`${exercise.name} set ${setNumber} weight`}
                      onChange={(e) =>
                        setEntries((m) => ({
                          ...m,
                          [`${exercise.id}:${setNumber}`]: {
                            ...m[`${exercise.id}:${setNumber}`],
                            load: e.target.value === "" ? undefined : Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted">
            Leave a field empty and it logs as programmed. Clear every set at the top of the range
            and the plan offers you the next weight — it never changes it on its own.
          </p>
        </div>
      )}

      {onLog && !isRest && (status === "planned" || status === "moved") && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LogButton
              action="planned"
              primary
              icon={<CheckIcon size={16} />}
              label="As planned"
              hint="It matched the target — the plan holds its course."
            />
            <LogButton
              action="harder"
              icon={<FlameIcon size={16} />}
              label="Felt harder"
              hint="Harder than the target said. The engine backs the load off."
            />
            <LogButton
              action="easier"
              icon={<FeatherIcon size={16} />}
              label="Felt easier"
              hint="Easier than the target said. Twice in a row and the engine steps you up."
            />
            <LogButton
              action="skip"
              icon={<SkipIcon size={16} />}
              label="Skip"
              hint="Not done. The plan bends — no make-up pile-up."
            />
          </div>
          {/* The labels alone read as a wish; they are a report. */}
          <p className="mt-2 text-[11px] text-muted">
            How it went, not what you want next — the engine reads these as your effort against the
            target.
          </p>
        </div>
      )}

      {/* Wrong tap? Take the day back — log and calibration are rolled back. */}
      {onReset && !isRest && logged && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="text-xs text-muted">
            {status === "skipped" ? "Skipped by mistake?" : "Logged by mistake?"}
          </span>
          <button
            className="btn-ghost"
            onClick={pressReset}
            disabled={resetting}
            title="Reset this day — undo the log and the plan changes it caused"
          >
            {resetting ? <SpinnerIcon size={16} /> : <UndoIcon size={16} />}
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
