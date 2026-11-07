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
  WEEKDAY_LABELS,
} from "@/lib/format";
import { BlockView, stepCount } from "./BlockView";
import { EffortPicker } from "./EffortPicker";
import { Sheet } from "./Sheet";
import { PALETTE } from "@/lib/format";
import type { RenderedBlock } from "@/lib/engine";
import { CheckIcon, MoreIcon, MoveIcon, SkipIcon, SpinnerIcon, UndoIcon } from "./icons";
import { haptic } from "@/lib/haptics";

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
  /**
   * What was lifted the last time this exercise was logged, set by set — the
   * "previous" column. Empty when it has never been logged.
   */
  previous?: { set_number: number; reps: number | null; load_kg: number | null }[];
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
  /**
   * When provided, the card offers "Done" (which asks for the effort in a
   * sheet, starting on the target) and "Skip" in its ⋯ menu. `rpe` is the
   * effort picked on the scale when it differs from the target; it is absent
   * for "planned" and "skip".
   */
  onLog?: (action: LogAction, strengthSets?: StrengthSetInput[], rpe?: number) => void;
  /**
   * The athlete's own strength day for this session. Turns the card into a
   * fillable sheet: reps and kilos per set, sent along with the quick-log tap.
   */
  strength?: { templateName: string; exercises: StrengthExerciseInput[] } | null;
  status?: "planned" | "done" | "skipped" | "moved";
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
    original: a.collection_original,
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
  // Sets ticked off with the check — they carry the numbers shown in the row.
  const [doneSets, setDoneSets] = useState<Set<string>>(new Set());
  // The effort sheet: open after "Done", starting on the target.
  const [effort, setEffort] = useState<number | null>(null);
  // The ⋯ menu: skip and move, the things you do to a session rather than with it.
  const [menuOpen, setMenuOpen] = useState(false);
  const isRest = session.session_type === "rest";
  const target = session.intensity_rpe_target;

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

  function press(action: LogAction, rpe?: number) {
    haptic(action === "planned" ? "confirm" : "tap");
    onLog?.(action, action === "skip" ? undefined : collectSets(), rpe);
  }

  /**
   * "Done" asks one question: how hard was it? The scale opens on the target,
   * so a session that went as planned is two taps — Done, Save — and one that
   * did not is a drag of the slider in between.
   */
  function openDone() {
    haptic("tap");
    setEffort(Math.max(1, Math.min(10, target)));
  }

  function saveEffort() {
    if (effort == null) return;
    // On the target is "as planned"; either side of it is a number the engine
    // calibrates on.
    const action: LogAction = effort > target ? "harder" : effort < target ? "easier" : "planned";
    press(action, action === "planned" ? undefined : effort);
    setEffort(null);
  }

  function setField(key: string, field: "reps" | "load", raw: string) {
    setEntries((m) => ({
      ...m,
      [key]: { ...m[key], [field]: raw === "" ? undefined : Number(raw) },
    }));
  }

  /**
   * The check on a set row: done as shown. Whatever the row displays — typed
   * numbers, or the programmed ones in grey — becomes what was lifted. A second
   * tap empties the row again.
   */
  function toggleSet(exercise: StrengthExerciseInput, setNumber: number) {
    const key = `${exercise.id}:${setNumber}`;
    haptic("tap");
    if (doneSets.has(key)) {
      setDoneSets((d) => {
        const next = new Set(d);
        next.delete(key);
        return next;
      });
      setEntries((m) => {
        const { [key]: _, ...rest } = m;
        return rest;
      });
      return;
    }
    setDoneSets((d) => new Set(d).add(key));
    setEntries((m) => ({
      ...m,
      [key]: {
        reps: m[key]?.reps ?? exercise.rep_max ?? exercise.rep_min ?? undefined,
        load: m[key]?.load ?? exercise.load_kg ?? undefined,
      },
    }));
  }

  function pressReset() {
    haptic("tap");
    onReset?.();
  }

  const logged = status === "done" || status === "skipped";

  const canLog = Boolean(onLog) && !isRest && (status === "planned" || status === "moved");
  const canMove = Boolean(onMove) && !isRest;
  const hasMenu = canLog || canMove;

  const demand = demandOf(session.session_type);

  return (
    <div
      data-session-card
      data-session-title={session.title}
      className={`group relative flex gap-3.5 rounded-panel border p-4 transition-colors duration-150 ease-out ${
        focal
          ? "lift border-[1.5px] border-chalk bg-lane"
          : logged
            ? "border-edge bg-rack"
            : "border-edge bg-lane hover:border-edge-strong"
      }`}
    >
      {/* The effort rail: what this day asks of you, before a word is read. */}
      <span
        className="rail self-stretch"
        style={{ color: DEMAND_COLORS[demand] }}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
      <div className="relative flex items-start gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-mono text-micro font-bold uppercase tracking-widest text-ash">
              {WEEKDAY_LABELS[session.day_hint]}
              {date && <span className="ml-1.5 font-normal text-smoke">{fmtDayDate(date)}</span>}
              {showSlot && (
                <span className="ml-1 text-bone">{(session.day_slot ?? "am").toUpperCase()}</span>
              )}
            </span>
            <span
              className={`text-lead font-bold leading-tight ${
                status === "done"
                  ? "text-ash line-through decoration-go decoration-[3px]"
                  : logged
                    ? "text-ash"
                    : "text-chalk"
              }`}
            >
              {session.title}
            </span>
            {status === "done" && <CheckIcon size={16} className="shrink-0 text-go" />}
            {status === "skipped" && <span className="text-meta text-smoke">skipped</span>}
            {status === "moved" && <span className="text-meta text-ash">moved</span>}
          </div>
          {showSlot && session.day_slot === "pm" && (
            // The gap is the whole reason a double day works: closer than two
            // hours and the second session is training on unrecovered fatigue
            // rather than a second stimulus. It belongs on the card, where the
            // athlete decides when to go, not in a document.
            <div className="mt-1 text-meta text-ash">
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
          {!isRest && <IntensityBar blocks={session.blocks} accent={DEMAND_COLORS[demand]} />}
        </div>
        <span
          className={`text-ash transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        >
          ▸
        </span>
      </button>
      {hasMenu && (
        <button
          type="button"
          onClick={() => {
            haptic("tap");
            setMenuOpen((v) => !v);
          }}
          aria-label={`More for ${session.title}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ash transition-colors duration-150 hover:bg-rack hover:text-chalk"
        >
          <MoreIcon size={18} />
        </button>
      )}
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-56 overflow-hidden rounded-control border border-edge bg-lane shadow-lg animate-fade-up"
        >
          {canLog && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-base font-semibold text-chalk hover:bg-rack"
              disabled={busyAction != null}
              title="Not done. The plan bends — no make-up pile-up."
              onClick={() => {
                setMenuOpen(false);
                press("skip");
              }}
            >
              {busyAction === "skip" ? <SpinnerIcon size={16} /> : <SkipIcon size={16} />}
              Skip this session
            </button>
          )}
          {canMove && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 border-t border-edge px-3.5 py-3 text-left text-base font-semibold text-chalk first:border-t-0 hover:bg-rack"
              disabled={moving}
              title="Move this session to another day of the week"
              onClick={() => {
                haptic("tap");
                setMenuOpen(false);
                setMoveOpen(true);
              }}
            >
              <MoveIcon size={16} />
              Move to another day
            </button>
          )}
        </div>
      )}
      </div>

      {open && !isRest && (
        <div className="mt-4 space-y-2 animate-fade-up">
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
              {/* One script, numbered 1…n from warm-up to the last block — by
                  sort_order, never by array order: a caller that rebuilds the
                  list (swapping in an imported strength day, say) must not put
                  the finisher before the work it finishes. */}
              {(() => {
                const ordered = [...session.blocks].sort((a, b) => a.sort_order - b.sort_order);
                return ordered.map((b, i) => (
                  <BlockView
                    key={`${b.block_id}-${b.sort_order}`}
                    block={b}
                    accent={DEMAND_COLORS[demand]}
                    startAt={1 + ordered.slice(0, i).reduce((n, prev) => n + stepCount(prev), 0)}
                    substitution={b.station ? substitutions?.[b.station] : null}
                    onSwap={
                      onSwap && b.station && b.station !== "general"
                        ? () => onSwap(b.station as Station)
                        : undefined
                    }
                  />
                ));
              })()}
              {(() => {
                const spec = runSpec(session.session_type);
                const variant = variantOf(session);
                // Strength and station days have no run spec, but their
                // variant still says what it is for and where it comes from.
                if (!spec)
                  return variant?.why ? (
                    <div className="space-y-1 px-1 text-meta text-ash" data-testid="variant-note">
                      <p>
                        <b className="text-chalk">{variant.name}:</b> {variant.why}
                      </p>
                      {variant.original && (
                        <p className="text-micro text-smoke">Verona plan: {variant.original}</p>
                      )}
                    </div>
                  ) : null;
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
                    {variant?.original && (
                      <p className="text-micro text-smoke">Verona plan: {variant.original}</p>
                    )}
                  </div>
                );
              })()}
          </>
        </div>
      )}

      {/* Collapsed, the imported programme is one line — a closed card must
          not be a page of inputs. Open the card to fill in sets; logging
          without opening records everything as programmed. */}
      {strength && !open && !isRest && (status === "planned" || status === "moved") && (
        <div className="mt-3 flex w-full items-center justify-between gap-3 rounded-control border border-edge bg-well/60 px-3 py-2 text-meta">
          <span className="font-semibold text-bone">{strength.templateName}</span>
          <span className="text-ash">{strength.exercises.length} exercises</span>
        </div>
      )}

      {strength && onLog && open && !isRest && (status === "planned" || status === "moved") && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-meta">
            <span className="font-semibold text-chalk">{strength.templateName}</span>
            <span className="text-ash">tick a set, or type what you lifted</span>
          </div>
          {strength.exercises.map((exercise) => (
            <div
              key={exercise.id}
              className="overflow-hidden rounded-control border border-edge bg-rack"
              data-strength-exercise={exercise.name}
            >
              <div className="flex flex-wrap items-baseline gap-2 px-3 pb-1.5 pt-2.5">
                <span className="text-base font-medium text-chalk">{exercise.name}</span>
                {exercise.superset_group && <span className="pill">SS {exercise.superset_group}</span>}
                <span className="font-mono text-meta text-ash">
                  {exercise.sets}×{" "}
                  {exercise.rep_min === exercise.rep_max
                    ? exercise.rep_min ?? "—"
                    : `${exercise.rep_min ?? "?"}–${exercise.rep_max ?? "?"}`}{" "}
                  · {exercise.load_kg == null ? "bodyweight" : `${exercise.load_kg} kg`}
                </span>
              </div>
              <table className="w-full text-meta">
                <thead>
                  <tr className="text-meta font-bold text-bone">
                    <th className="w-10 py-1 pl-3 text-left font-semibold">Set</th>
                    <th className="py-1 text-left font-semibold">Previous</th>
                    <th className="w-[4.5rem] py-1 text-center font-semibold">kg</th>
                    <th className="w-16 py-1 text-center font-semibold">Reps</th>
                    <th className="w-12 py-1 pr-2 text-center font-semibold">
                      <span className="sr-only">Done</span>
                      <CheckIcon size={13} className="inline" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: exercise.sets }, (_, i) => i + 1).map((setNumber) => {
                    const key = `${exercise.id}:${setNumber}`;
                    const entry = entries[key];
                    const done = doneSets.has(key);
                    const prev = exercise.previous?.find((p) => p.set_number === setNumber);
                    return (
                      <tr
                        key={setNumber}
                        className={`border-t border-edge transition-colors duration-150 ${
                          done ? "bg-wash" : ""
                        }`}
                      >
                        <td className="py-1.5 pl-3 font-mono font-semibold text-ash">{setNumber}</td>
                        <td
                          className="whitespace-nowrap py-1.5 font-mono text-smoke"
                          title={prev ? "Last time: kg × reps" : "Not logged before"}
                        >
                          {prev && (prev.reps != null || prev.load_kg != null)
                            ? `${prev.load_kg ?? "BW"}×${prev.reps ?? "—"}`
                            : "—"}
                        </td>
                        <td className="px-1 py-1.5">
                          <input
                            className="input no-spin px-2 py-1 text-center font-mono text-meta"
                            type="number"
                            min="0"
                            step="0.5"
                            inputMode="decimal"
                            placeholder={exercise.load_kg == null ? "BW" : String(exercise.load_kg)}
                            aria-label={`${exercise.name} set ${setNumber} weight`}
                            value={entry?.load ?? ""}
                            onChange={(e) => setField(key, "load", e.target.value)}
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <input
                            className="input no-spin px-2 py-1 text-center font-mono text-meta"
                            type="number"
                            min="0"
                            inputMode="numeric"
                            placeholder={String(exercise.rep_max ?? exercise.rep_min ?? "")}
                            aria-label={`${exercise.name} set ${setNumber} reps`}
                            value={entry?.reps ?? ""}
                            onChange={(e) => setField(key, "reps", e.target.value)}
                          />
                        </td>
                        <td className="py-1.5 pr-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSet(exercise, setNumber)}
                            aria-pressed={done}
                            aria-label={`${exercise.name} set ${setNumber} done`}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-control border transition-colors duration-150 ${
                              done
                                ? "border-go bg-wash text-go"
                                : "border-edge bg-well text-smoke hover:border-edge-strong hover:text-bone"
                            }`}
                          >
                            <CheckIcon size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          <p className="text-micro text-ash">
            The check takes the numbers in the row — the grey ones are the programme. Typed reps
            with an empty kg field log the programmed weight; an untouched set is not recorded.
            Clear every set at the top of the range and the plan offers you the next weight — it
            never changes it on its own.
          </p>
        </div>
      )}

      {/* One action on the card. A strength day opens its set table first —
          the sets are what gets logged — and finishes into the same question. */}
      {canLog && (
        <div className="mt-4">
          {strength && !open ? (
            <button
              type="button"
              className={`${focal ? "btn-primary" : "btn-ghost"} w-full`}
              onClick={() => {
                haptic("tap");
                setOpen(true);
              }}
            >
              <CheckIcon size={16} />
              Log sets
            </button>
          ) : (
            <button
              type="button"
              className={`${focal ? "btn-primary" : "btn-ghost"} w-full`}
              onClick={openDone}
              disabled={busyAction != null}
              title="Log it — the next question is how hard it was."
            >
              {busyAction != null && busyAction !== "skip" ? (
                <SpinnerIcon size={16} />
              ) : (
                <CheckIcon size={16} />
              )}
              {strength ? "Finish" : "Done"}
            </button>
          )}
        </div>
      )}

      {effort != null && (
        <Sheet label={`How hard was ${session.title}?`} onClose={() => setEffort(null)}>
          <div className="mb-1 text-center text-meta font-bold text-ash">{session.title}</div>
          <EffortPicker
            bare
            value={effort}
            target={target}
            onChange={setEffort}
            onSave={saveEffort}
            onCancel={() => setEffort(null)}
            saving={busyAction != null}
          />
        </Sheet>
      )}

      {/* Life happens: put the session on a day that actually works. Inside the
          opened card, not under every collapsed one — six rows of "Move" in a
          list you scan for today's session is furniture, not a feature. */}
      {onMove && !isRest && moveOpen && (
        <div className="mt-3 border-t border-edge pt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-meta font-bold text-bone">
              {moving ? <SpinnerIcon size={14} /> : <MoveIcon size={14} />}
              Move to
            </span>
            <button type="button" className="text-meta text-ash hover:text-chalk" onClick={() => setMoveOpen(false)}>
              Cancel
            </button>
          </div>
          {moveOpen && (
            <div className="space-y-2 animate-fade-up">
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
                            ? `${WEEKDAY_LABELS[day]} is taken — the two sessions swap days`
                            : `Move to ${WEEKDAY_LABELS[day]}`
                      }
                      onClick={() => {
                        haptic("confirm");
                        setMoveOpen(false);
                        onMove(day, targetSlot);
                      }}
                    >
                      <span className={taken ? "text-amber" : undefined}>
                        {WEEKDAY_LABELS[day].slice(0, 2)}
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

const PART_LABEL: Record<RenderedBlock["block_type"], string> = {
  warmup: "Warm-up",
  main: "Main set",
  finisher: "Finisher",
  mobility: "Mobility",
};

/**
 * The shape of the session before a word of it is read: one segment per block,
 * as wide as the block is long in steps. Warm-up and mobility are quiet, the
 * main set carries the day's colour, a finisher is the hard red.
 */
export function IntensityBar({ blocks, accent }: { blocks: RenderedBlock[]; accent: string }) {
  const ordered = [...blocks].sort((a, b) => a.sort_order - b.sort_order);
  if (ordered.length < 2) return null;
  const colour = (b: RenderedBlock) =>
    b.block_type === "main" ? accent : b.block_type === "finisher" ? PALETTE.flame : PALETTE.smoke;
  return (
    <div
      className="mt-2.5 flex h-1.5 max-w-xs gap-[3px]"
      role="img"
      aria-label={`Session shape: ${ordered.map((b) => PART_LABEL[b.block_type]).join(", ")}`}
      data-testid="intensity-bar"
    >
      {ordered.map((b) => (
        <span
          key={`${b.block_id}-${b.sort_order}`}
          title={PART_LABEL[b.block_type]}
          className="rounded-full"
          style={{
            flex: Math.max(1, stepCount(b)),
            background: colour(b),
            opacity: b.block_type === "main" || b.block_type === "finisher" ? 1 : 0.45,
          }}
        />
      ))}
    </div>
  );
}
