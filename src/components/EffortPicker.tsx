"use client";

import { RPE_DELTA_DOWN_THRESHOLD, RPE_DELTA_UP_THRESHOLD } from "@/lib/engine/constants";
import { PALETTE } from "@/lib/format";
import { SpinnerIcon } from "./icons";

/**
 * The 1–10 effort scale in words. A number alone is a guess; a sentence about
 * breathing and talking is something you can actually check against.
 */
export const RPE_SCALE: Record<number, { label: string; feel: string }> = {
  1: { label: "Very light", feel: "Barely working — a walk, a shake-out." },
  2: { label: "Light", feel: "Easy breathing, you could chat for hours." },
  3: { label: "Moderate", feel: "Breathing deeper, still full sentences." },
  4: { label: "Somewhat hard", feel: "Working, but comfortable. Sentences get shorter." },
  5: { label: "Hard", feel: "Breathing heavily, a few words at a time." },
  6: { label: "Harder", feel: "Sustainable, but you are counting the minutes." },
  7: { label: "Very hard", feel: "Speech is broken, you want it to end." },
  8: { label: "Very, very hard", feel: "A word or two at most — holding on." },
  9: { label: "Near max", feel: "Barely hanging on. Seconds, not minutes." },
  10: { label: "Max effort", feel: "Nothing left. You could not have done one more rep." },
};

/** The colour of an effort: aerobic green through amber to the flame. */
export function rpeColor(rpe: number): string {
  if (rpe <= 3) return PALETTE.go;
  if (rpe <= 6) return PALETTE.amber;
  return PALETTE.flame;
}

/** What the engine will make of this number, said before it is saved. */
export function effortConsequence(rpe: number, target: number): string {
  const delta = rpe - target;
  if (delta >= RPE_DELTA_DOWN_THRESHOLD)
    return `${delta} above the target of ${target} — the plan backs this kind of session off a step.`;
  if (delta <= RPE_DELTA_UP_THRESHOLD)
    return `${-delta} below the target of ${target} — twice in a row and the plan steps you up.`;
  if (delta === 0) return `Right on the target of ${target} — the plan holds its course.`;
  return `Within a point of the target of ${target} — the plan holds its course.`;
}

// ── The arc ────────────────────────────────────────────────────────────────
// 240° of a circle, open at the bottom, cut into ten segments.
const CX = 100;
const CY = 100;
const R = 78;
const START = 150; // degrees, measured clockwise from 3 o'clock
const SWEEP = 240;
const GAP = 4;

function point(angleDeg: number, r = R) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function segmentPath(i: number): string {
  const step = SWEEP / 10;
  const from = START + i * step + GAP / 2;
  const to = START + (i + 1) * step - GAP / 2;
  const p0 = point(from);
  const p1 = point(to);
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${R} ${R} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

interface Props {
  value: number;
  target: number;
  onChange: (rpe: number) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}

/**
 * "How hard was it?" — the effort of a session as one number, chosen on a
 * scale that says what each number feels like and what the plan will do with
 * it. The arc is the picture; the slider underneath is the control (keyboard,
 * screen reader and thumb all reach it).
 */
export function EffortPicker({ value, target, onChange, onSave, onCancel, saving }: Props) {
  const color = rpeColor(value);
  const scale = RPE_SCALE[value];
  const targetPoint = point(START + (target - 0.5) * (SWEEP / 10), R + 13);

  return (
    <div className="rounded-panel border border-edge-strong bg-rack p-4 animate-pop-in" data-effort-picker>
      <div className="text-center text-base font-semibold text-chalk">How hard was it?</div>

      <div className="relative mx-auto mt-1 w-full max-w-[220px]">
        <svg viewBox="0 0 200 172" className="w-full" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <path
              key={i}
              d={segmentPath(i)}
              fill="none"
              strokeWidth={12}
              strokeLinecap="butt"
              stroke={i < value ? rpeColor(i + 1) : "rgba(255,255,255,0.08)"}
              style={{ transition: "stroke 150ms ease-out" }}
            />
          ))}
          {/* Where the plan wanted you. */}
          <circle cx={targetPoint.x} cy={targetPoint.y} r={3} fill={PALETTE.ash} />
          <text
            x={CX}
            y={CY + 4}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-mono"
            style={{ fontSize: 56, fontWeight: 700, fill: color }}
          >
            {value}
          </text>
        </svg>
      </div>

      <div className="-mt-3 text-center">
        <div className="text-h3 font-bold" style={{ color }}>
          {scale.label}
        </div>
        <p className="mx-auto mt-1 max-w-[34ch] text-meta text-ash">{scale.feel}</p>
      </div>

      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Session effort (RPE 1 to 10)"
        aria-valuetext={`${value} — ${scale.label}`}
        className="mt-4 w-full"
        style={{ accentColor: color }}
      />
      <div className="relative h-4 font-mono text-micro text-smoke">
        <span className="absolute left-0">1</span>
        {/* Under the slider position the plan asked for. */}
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap text-ash"
          style={{ left: `${Math.min(85, Math.max(15, ((target - 1) / 9) * 100))}%` }}
        >
          ▲ target {target}
        </span>
        <span className="absolute right-0">10</span>
      </div>

      <p className="mt-3 rounded-control bg-well/70 px-3 py-2 text-meta text-bone" data-testid="effort-consequence">
        {effortConsequence(value, target)}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
          {saving && <SpinnerIcon size={16} />}
          Save effort
        </button>
      </div>
    </div>
  );
}
