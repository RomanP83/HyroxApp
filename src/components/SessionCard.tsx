"use client";

import { useState } from "react";
import type { GeneratedSession } from "@/lib/engine";
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

interface Props {
  session: GeneratedSession;
  /** When provided, renders the 4-button quick-log row. */
  onLog?: (action: LogAction) => void;
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

export function SessionCard({
  session,
  onLog,
  status = "planned",
  locked,
  busyAction,
  onReset,
  resetting,
  showSlot,
}: Props) {
  const [open, setOpen] = useState(false);
  const isRest = session.session_type === "rest";

  function press(action: LogAction) {
    haptic(action === "planned" ? "confirm" : "tap");
    onLog?.(action);
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
    primary,
  }: {
    action: LogAction;
    icon: React.ReactNode;
    label: string;
    primary?: boolean;
  }) => (
    <button
      className={primary ? "btn-primary" : "btn-ghost"}
      onClick={() => press(action)}
      disabled={busyAction != null}
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
            session.blocks.map((b) => <BlockView key={`${b.block_id}-${b.sort_order}`} block={b} />)
          )}
        </div>
      )}

      {onLog && !isRest && (status === "planned" || status === "moved") && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <LogButton action="planned" primary icon={<CheckIcon size={16} />} label="As planned" />
          <LogButton action="harder" icon={<FlameIcon size={16} />} label="Harder" />
          <LogButton action="easier" icon={<FeatherIcon size={16} />} label="Easier" />
          <LogButton action="skip" icon={<SkipIcon size={16} />} label="Skip" />
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
