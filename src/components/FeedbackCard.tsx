"use client";

import type { SessionFeedback, MetricComparison } from "@/lib/engine";
import { fmtPace } from "@/lib/format";

interface Props {
  feedback: SessionFeedback;
  onClose?: () => void;
}

function fmtValue(m: MetricComparison, v: number): string {
  switch (m.key) {
    case "pace":
      return fmtPace(v);
    case "duration":
      return `${Math.round(v)}'`;
    case "distance":
      return `${(v / 1000).toFixed(1)} km`;
    default:
      return String(v);
  }
}

function badgeColor(verdict: MetricComparison["verdict"]): string {
  return verdict === "on_target" ? "bg-ok/20 text-ok" : "bg-blue-500/20 text-blue-300";
}

/** Where the actual value sits on the mini gauge: 0 = far below, 1 = far above. */
function gaugePosition(m: MetricComparison): number {
  return Math.max(0, Math.min(1, 0.5 + m.deviation));
}

export function FeedbackCard({ feedback, onClose }: Props) {
  return (
    <div className="card space-y-5">
      {/* Coach message */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">{feedback.headline}</h3>
          <p className="mt-2 text-sm text-muted">{feedback.coachText}</p>
          {feedback.aiGenerated && (
            <span className="mt-2 inline-block text-[10px] uppercase tracking-wide text-muted">
              AI coach · numbers computed by the plan engine
            </span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        )}
      </div>

      {/* Fulfillment index */}
      <div className="rounded-lg border border-line bg-surface2 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Fulfillment index</div>
            <div className="text-xs text-muted">How closely you matched the session targets</div>
          </div>
          <div className="text-3xl font-bold">
            {feedback.score}
            <span className="text-base font-normal text-muted"> / 100</span>
          </div>
        </div>
        <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-ok">
          <div
            className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-base"
            style={{ left: `calc(${feedback.score}% - 8px)` }}
          />
        </div>
      </div>

      {/* IST-SOLL comparison */}
      <div>
        <div className="mb-2 text-center text-sm font-semibold text-muted">
          Actual vs. planned
        </div>
        <div className="space-y-2">
          {feedback.metrics.map((m) => (
            <div key={m.key} className="rounded-lg border border-line bg-surface2 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                  {m.label}
                </div>
                <div className="flex-1">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${badgeColor(m.verdict)}`}
                  >
                    {m.badge}
                  </span>
                  {/* mini gauge: center = target */}
                  <div className="relative mt-1.5 flex h-1.5 gap-0.5">
                    <div className="flex-1 rounded-l bg-line" />
                    <div className="flex-1 bg-muted/40" />
                    <div className="flex-1 rounded-r bg-line" />
                    <div
                      className="absolute -top-0.5 h-2.5 w-1 rounded bg-accent2"
                      style={{ left: `calc(${gaugePosition(m) * 100}% - 2px)` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-bold leading-tight">{fmtValue(m, m.actual)}</div>
                  <div className="text-xs text-muted">{fmtValue(m, m.target)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
