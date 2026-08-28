"use client";

import { useState } from "react";
import type { DaySlot, GeneratedSession, Station, StationAlternative } from "@/lib/engine";
import { DOUBLE_DAY_GAP_HOURS, runSpec } from "@/lib/engine";
import {
  DEMAND_COLORS,
  DEMAND_LABELS,
  demandOf,
  fmtDayDate,
  fmtPace,
  PACE_ZONE_HR,
  PACE_ZONE_LABEL,
} from "@/lib/format";
import { BlockView } from "./BlockView";
import {
  CheckIcon,
  FlameIcon,
  FeatherIcon,
  MoveIcon,
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
  /**
   * Move this session to another day (and half) of the same week. Life happens:
   * the week bends, the plan does not break.
   */
  onMove?: (dayHint: number, daySlot: DaySlot) => void;
  /** Move request in flight. */
  moving?: boolean;
  /**
   * Which "<day>-<slot>" pairs of this week are already occupied — the caller
   * sees the whole week, this card only sees itself. Occupied halves are
   * offered as a SWAP rather than being disabled: two sessions trading days is
   * the most common reason to move one at all.
   */
  occupied?: Set<string>;
  /**
   * The one session this page is about — today's. Exactly one card in a week
   * should get it: a focal point that competes with six others is not one.
   */
  focal?: boolean;
  /** Start expanded — the details are the point, not a tap away. */
  defaultOpen?: boolean;
  /**
   * The calendar date this session falls on, ISO. "Wednesday" is ambiguous the
   * moment you page back a week; the date is not.
   */
  date?: string | null;
  /** The athlete's standing station substitutions, resolved. */
  substitutions?: Partial<Record<Station, StationAlternative>>;
  /** Open the swap list for a station. Omitted where swapping is not offered. */
  onSwap?: (station: Station) => void;
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
  paceZone?: string;
  opening?: number;
  openingDistance?: number;
} {
  const block = session.blocks.find((b) => b.load_adjustments.pace_sec_km != null);
  return {
    pace: block?.load_adjustments.pace_sec_km,
    paceZone: block?.load_adjustments.pace_zone,
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
  onMove,
  moving,
  occupied,
  focal,
  defaultOpen,
  date,
  substitutions,
  onSwap,
}: Props) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [moveOpen, setMoveOpen] = useState(false);
  // Which half of the day the picked day should land in. Defaults to the half
  // the session already sits in, so a plain "Wednesday instead of Tuesday" is
  // one tap.
  const [targetSlot, setTargetSlot] = useState<DaySlot>(session.day_slot ?? "am");
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

  const demand = demandOf(session.session_type);

  return (
    <div
      data-session-card
      data-session-title={session.title}
      className={`group relative flex gap-3.5 rounded-panel border p-4 transition-colors duration-150 ease-out ${
        focal
          ? "border-edge-strong bg-rack"
          : "border-transparent bg-lane/60 hover:border-edge hover:bg-lane"
      } ${logged ? "opacity-70" : ""}`}
    >
      {/* The effort rail: what this day asks of you, before a word is read. */}
      <span
        className="rail self-stretch"
        style={{ color: DEMAND_COLORS[demand] }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-mono text-micro font-bold uppercase tracking-widest text-ash">
              {DAY_LABELS[session.day_hint] ?? `D${session.day_hint}`}
              {date && <span className="ml-1.5 font-normal text-smoke">{fmtDayDate(date)}</span>}
              {showSlot && (
                <span className="ml-1 text-amber">{(session.day_slot ?? "am").toUpperCase()}</span>
              )}
            </span>
            <span className="text-lead font-semibold leading-tight text-chalk">{session.title}</span>
            {status === "done" && <CheckIcon size={16} className="shrink-0 text-go" />}
            {status === "skipped" && <span className="text-meta text-smoke">skipped</span>}
            {status === "moved" && <span className="text-meta text-ash">moved</span>}
          </div>
          {showSlot && session.day_slot === "pm" && (
            // The gap is the whole reason a double day works: closer than two
            // hours and the second session is training on unrecovered fatigue
            // rather than a second stimulus. It belongs on the card, where the
            // athlete decides when to go, not in a document.
            <div className="mt-1 text-meta text-amber">
              {DOUBLE_DAY_GAP_HOURS.min}–{DOUBLE_DAY_GAP_HOURS.max} h after the morning session
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-meta text-ash">
            <span style={{ color: DEMAND_COLORS[demand] }} className="font-semibold">
              {DEMAND_LABELS[demand]}
            </span>
            <span className="text-smoke">·</span>
            <span className="font-mono">{session.planned_duration_min} min</span>
            <span className="text-smoke">·</span>
            <span>
              RPE target <span className="font-mono">{session.intensity_rpe_target}</span>/10
            </span>
          </div>
          {(() => {
            // Running is 50-60% of the race: a run session says which zone it
            // is for and at what pace, not just how long it is.
            const spec = runSpec(session.session_type);
            if (!spec) return null;
            const { pace, paceZone, opening, openingDistance } = pacesOf(session);
            const variant = variantOf(session);
            return (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta">
                {/* Which shape of the core session this week gets. */}
                {variant && (
                  <span className="pill border-flame/60 text-chalk">
                    {variant.name}
                    {variant.targeted && <span className="ml-1 text-flame">· your weak spot</span>}
                  </span>
                )}
                <span className="pill text-amber">
                  {(paceZone && PACE_ZONE_HR[paceZone]) ?? spec.hr_zone}
                </span>
                {pace != null && (
                  <span className="pill">
                    {paceZone ? `${PACE_ZONE_LABEL[paceZone]} · ` : ""}
                    {fmtPace(pace)}
                  </span>
                )}
                {/* Coming out of a station you run slower on purpose — that
                    belongs on the front of the card, not one tap deeper. */}
                {opening != null && (
                  <span className="pill">
                    first {openingDistance} m: {fmtPace(opening)}
                  </span>
                )}
                <span className="text-ash">{spec.distance_hint}</span>
              </div>
            );
          })()}
        </div>
        <span
          className={`text-ash transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          ▸
        </span>
      </button>

      {open && !isRest && (
        <div className="mt-4 space-y-2 animate-fade-up">
          {locked ? (
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-edge p-4 text-sm text-ash">
              <LockIcon size={18} className="mt-0.5 shrink-0" />
              <span>
                This week is part of your full race cycle. Unlock it to see every block, weight
                and pace — week 1 stays free forever.
              </span>
            </div>
          ) : (
            <>
              {session.session_type === "race_day" && (
                <div className="rounded-lg border border-dashed border-edge p-4 text-sm">
                  <div className="font-semibold">Race day.</div>
                  <p className="mt-1 text-ash">
                    No prescription here — the event is the session. Warm up the way you always do,
                    hold your opening pace out of the first station, and log it afterwards so the
                    plan can recalibrate on it.
                  </p>
                </div>
              )}
              {/* By sort_order, never by array order. That field is what says
                  which block comes when, and a caller that rebuilds the list —
                  swapping in an imported strength day, say — should not be able
                  to put the finisher before the work it finishes. */}
              {[...session.blocks]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((b) => (
                <BlockView
                  key={`${b.block_id}-${b.sort_order}`}
                  block={b}
                  substitution={b.station ? substitutions?.[b.station] : null}
                  onSwap={
                    onSwap && b.station && b.station !== "general"
                      ? () => onSwap(b.station as Station)
                      : undefined
                  }
                  />
                ))}
              {(() => {
                const spec = runSpec(session.session_type);
                const variant = variantOf(session);
                if (!spec) return null;
                return (
                  <div className="space-y-1 px-1 text-meta text-ash">
                    {variant?.why && (
                      <p>
                        <b className="text-chalk">{variant.name}:</b> {variant.why}
                      </p>
                    )}
                    <p>
                      <b>{spec.focus}</b>{" "}
                      {/* The type's pace note describes the category — "reps at
                          3k–5k effort" for intervals. When the session names
                          its own zone the note can flatly contradict it, and a
                          card that argues with itself is worse than a quiet
                          one: the variant's own `why` above already says what
                          this session is for. */}
                      {session.blocks.some((b) => b.load_adjustments.pace_zone)
                        ? null
                        : spec.pace_note}
                    </p>
                    {variant?.fallback && <p className="italic">{variant.fallback}</p>}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* Collapsed, the imported programme is one line — a closed card must
          not be a page of inputs. Open the card to fill in sets; logging
          without opening records everything as programmed. */}
      {strength && !open && !isRest && (status === "planned" || status === "moved") && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 flex w-full items-center justify-between gap-3 rounded-control border border-edge bg-well/60 px-3 py-2 text-meta transition-colors duration-150 hover:border-edge-strong"
        >
          <span className="font-semibold text-bone">{strength.templateName}</span>
          <span className="text-ash">
            {strength.exercises.length} exercises · tap to log sets
          </span>
        </button>
      )}

      {strength && onLog && open && !isRest && (status === "planned" || status === "moved") && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-meta">
            <span className="font-semibold">{strength.templateName}</span>
            <span className="text-ash">reps · kg per set</span>
          </div>
          {strength.exercises.map((exercise) => (
            <div key={exercise.id} className="rounded-lg border border-edge bg-rack p-2">
              <div className="mb-1 flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-medium">{exercise.name}</span>
                {exercise.superset_group && <span className="pill">SS {exercise.superset_group}</span>}
                <span className="text-meta text-ash">
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
                    <span className="text-[10px] text-ash">S{setNumber}</span>
                    <input
                      className="input w-14 px-2 py-1 text-right font-mono text-meta"
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
                      className="input w-16 px-2 py-1 text-right font-mono text-meta"
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
          <p className="text-micro text-ash">
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
              primary={focal}
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
          {/* The labels alone read as a wish; they are a report. Said once, on
              the session in focus — repeated under all six it is just noise
              (every button carries the same explanation as a tooltip). */}
          {focal && (
            <p className="mt-2 text-micro text-ash">
              How it went, not what you want next — the engine reads these as your effort against
              the target.
            </p>
          )}
        </div>
      )}

      {/* Life happens: put the session on a day that actually works. Inside the
          opened card, not under every collapsed one — six rows of "Move" in a
          list you scan for today's session is furniture, not a feature. */}
      {onMove && !isRest && open && (
        <div className="mt-3 border-t border-edge pt-3">
          <div className="flex items-center justify-end gap-3">
            <button
              className="btn-quiet"
              onClick={() => {
                haptic("tap");
                setMoveOpen((v) => !v);
              }}
              disabled={moving}
              aria-expanded={moveOpen}
              title="Move this session to another day of the week"
            >
              {moving ? <SpinnerIcon size={16} /> : <MoveIcon size={16} />}
              Move
            </button>
          </div>

          {moveOpen && (
            <div className="mt-3 space-y-2 animate-fade-up">
              {showSlot && (
                <div className="flex items-center gap-2">
                  <span className="text-micro text-ash">Half of the day:</span>
                  {(["am", "pm"] as const).map((half) => (
                    <button
                      key={half}
                      type="button"
                      className={`chip ${targetSlot === half ? "chip-active" : ""}`}
                      onClick={() => setTargetSlot(half)}
                    >
                      {half.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-7 gap-1">
                {[1, 2, 3, 4, 5, 6, 7].map((day) => {
                  const here = day === session.day_hint && targetSlot === (session.day_slot ?? "am");
                  const taken = occupied?.has(`${day}-${targetSlot}`) && !here;
                  return (
                    <button
                      key={day}
                      type="button"
                      className={`chip justify-center ${here ? "chip-active" : ""}`}
                      disabled={moving || here}
                      title={
                        here
                          ? "This is where it already is"
                          : taken
                            ? `${DAY_LABELS[day]} is taken — the two sessions swap days`
                            : `Move to ${DAY_LABELS[day]}`
                      }
                      onClick={() => {
                        haptic("confirm");
                        setMoveOpen(false);
                        onMove(day, targetSlot);
                      }}
                    >
                      <span className={taken ? "text-amber" : undefined}>
                        {DAY_LABELS[day].slice(0, 2)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-micro text-ash">
                A day that already has a session swaps with this one — nothing is dropped, and the
                week keeps its shape.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Wrong tap? Take the day back — log and calibration are rolled back. */}
      {onReset && !isRest && logged && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-edge pt-3">
          <span className="text-meta text-ash">
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
    </div>
  );
}
