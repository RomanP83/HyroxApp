"use client";

import { useState } from "react";
import type { GeneratedSession } from "@/lib/engine";
import { BlockView } from "./BlockView";
import { titleCase } from "@/lib/format";

const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type LogAction = "planned" | "harder" | "easier" | "skip";

interface Props {
  session: GeneratedSession;
  /** When provided, renders the 4-button quick-log row. */
  onLog?: (action: LogAction) => void;
  status?: "planned" | "done" | "skipped" | "moved";
  locked?: boolean;
}

export function SessionCard({ session, onLog, status = "planned", locked }: Props) {
  const [open, setOpen] = useState(false);
  const isRest = session.session_type === "rest";

  return (
    <div className="card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="pill">{DAY_LABELS[session.day_hint] ?? `D${session.day_hint}`}</span>
            <span className="font-semibold">{session.title}</span>
            {status === "done" && <span className="text-ok">✓</span>}
            {status === "skipped" && <span className="text-muted">skipped</span>}
          </div>
          <div className="mt-1 text-xs text-muted">
            {titleCase(session.session_type)} · {session.planned_duration_min} min · RPE target{" "}
            {session.intensity_rpe_target}/10
          </div>
        </div>
        <span className="text-muted">{open ? "▾" : "▸"}</span>
      </button>

      {open && !isRest && (
        <div className="mt-4 space-y-2">
          {locked ? (
            <div className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
              🔒 Locked preview — unlock the full race cycle to see every session’s blocks,
              weights and paces.
            </div>
          ) : (
            session.blocks.map((b) => <BlockView key={`${b.block_id}-${b.sort_order}`} block={b} />)
          )}
        </div>
      )}

      {onLog && !isRest && status === "planned" && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button className="btn-primary" onClick={() => onLog("planned")}>
            ✅ As planned
          </button>
          <button className="btn-ghost" onClick={() => onLog("harder")}>
            🔥 Harder
          </button>
          <button className="btn-ghost" onClick={() => onLog("easier")}>
            🪶 Easier
          </button>
          <button className="btn-ghost" onClick={() => onLog("skip")}>
            ⏭️ Skip
          </button>
        </div>
      )}
    </div>
  );
}
