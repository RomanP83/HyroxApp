// ============================================================================
// Post-session training feedback (running.COACH-style "Trainingsfeedback")
// Deterministic core: IST-SOLL comparison per metric + fulfillment index
// (0-100) + a template coach text. An LLM may REPHRASE the coach text
// server-side (see src/lib/coachFeedback.ts), but every number and verdict
// comes from here — consistent with "no LLM in the plan core" (PP1).
// ============================================================================

import type { SessionType } from "./types";

export type MetricKey = "load" | "duration" | "intensity" | "distance" | "pace";
export type MetricVerdict = "on_target" | "below" | "above";

export interface MetricComparison {
  key: MetricKey;
  label: string;
  actual: number;
  target: number;
  unit: string;
  /** Signed deviation ratio: (actual - target) / target. */
  deviation: number;
  verdict: MetricVerdict;
  /** Short badge text as in the reference UI ("TOO SHORT", "PERFECT", …). */
  badge: string;
  /** 0..1 closeness score for this metric. */
  score: number;
  weight: number;
}

export interface SessionFeedback {
  /** Fulfillment index 0-100: how well the session matched the plan. */
  score: number;
  headline: string;
  /** Deterministic 3-4 sentence coach text (LLM may rephrase, never invent). */
  coachText: string;
  metrics: MetricComparison[];
  /** True once an LLM rephrased coachText (set by the server, never here). */
  aiGenerated?: boolean;
}

export interface FeedbackInput {
  sessionType: SessionType;
  sessionTitle?: string;
  rpeTarget: number;
  rpeActual: number;
  plannedDurationMin: number;
  actualDurationMin: number;
  /** Optional — only when the session carries a pace target / logged pace. */
  targetPaceSecKm?: number;
  actualPaceSecKm?: number;
  /** Optional — only when a distance was planned and logged. */
  plannedDistanceM?: number;
  actualDistanceM?: number;
}

// Within ±5% counts as on target; score falls linearly to 0 at 65% deviation.
const ON_TARGET_TOLERANCE = 0.05;
const ZERO_SCORE_DEVIATION = 0.65;

const WEIGHTS: Record<MetricKey, number> = {
  load: 0.3,
  duration: 0.3,
  intensity: 0.2,
  distance: 0.2,
  pace: 0.2,
};

function metricScore(deviation: number): number {
  const excess = Math.max(0, Math.abs(deviation) - ON_TARGET_TOLERANCE);
  return Math.max(0, 1 - excess / (ZERO_SCORE_DEVIATION - ON_TARGET_TOLERANCE));
}

function verdictOf(deviation: number): MetricVerdict {
  if (Math.abs(deviation) <= ON_TARGET_TOLERANCE) return "on_target";
  return deviation < 0 ? "below" : "above";
}

const BADGES: Record<MetricKey, Record<MetricVerdict, string>> = {
  load: { on_target: "ON TARGET", below: "TOO LOW", above: "TOO HIGH" },
  duration: { on_target: "ON TARGET", below: "TOO SHORT", above: "TOO LONG" },
  intensity: { on_target: "ON TARGET", below: "TOO EASY", above: "TOO HARD" },
  distance: { on_target: "ON TARGET", below: "TOO SHORT", above: "TOO LONG" },
  // For pace, a lower sec/km value means faster than planned.
  pace: { on_target: "PERFECT", below: "TOO FAST", above: "TOO SLOW" },
};

function compare(
  key: MetricKey,
  label: string,
  actual: number,
  target: number,
  unit: string,
): MetricComparison {
  const deviation = target > 0 ? (actual - target) / target : 0;
  const verdict = verdictOf(deviation);
  return {
    key,
    label,
    actual,
    target,
    unit,
    deviation,
    verdict,
    badge: BADGES[key][verdict],
    score: metricScore(deviation),
    weight: WEIGHTS[key],
  };
}

const HEADLINES: [number, string][] = [
  [90, "Dialed in!"],
  [70, "Keep building!"],
  [50, "Solid base — sharpen the execution."],
  [0, "Off plan today — let's recalibrate."],
];

function headlineFor(score: number): string {
  return HEADLINES.find(([min]) => score >= min)?.[1] ?? HEADLINES[3][1];
}

function fmtMetric(m: MetricComparison): string {
  if (m.key === "pace") {
    const f = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}/km`;
    return `${f(m.actual)} vs. planned ${f(m.target)}`;
  }
  if (m.key === "distance") {
    return `${(m.actual / 1000).toFixed(1)} km of the planned ${(m.target / 1000).toFixed(1)} km`;
  }
  if (m.key === "duration") {
    return `${Math.round(m.actual)}' of the planned ${Math.round(m.target)}'`;
  }
  return `${m.actual} vs. planned ${m.target}`;
}

/** Deterministic 3-4 sentence coach text built only from computed metrics. */
function coachTextFor(
  input: FeedbackInput,
  metrics: MetricComparison[],
  score: number,
): string {
  const offTarget = metrics
    .filter((m) => m.verdict !== "on_target")
    .sort((a, b) => a.score - b.score);
  // Credit the most tangible on-target metric (pace beats abstract load/RPE).
  const PRAISE_ORDER: MetricKey[] = ["pace", "distance", "duration", "intensity", "load"];
  const onTarget = metrics
    .filter((m) => m.verdict === "on_target")
    .sort((a, b) => PRAISE_ORDER.indexOf(a.key) - PRAISE_ORDER.indexOf(b.key));
  const worst = offTarget[0];
  const best = onTarget[0];

  const sentences: string[] = [];

  if (!worst) {
    sentences.push(
      `You executed this session exactly as planned — that consistency is what makes the plan's progression work.`,
    );
  } else {
    const direction = worst.verdict === "below" ? "under" : "over";
    sentences.push(
      `You came in ${direction} plan on ${worst.label.toLowerCase()} (${fmtMetric(worst)}).`,
    );
    if (offTarget.length > 1) {
      sentences.push(
        `${offTarget[1].label} was also ${offTarget[1].verdict === "below" ? "below" : "above"} target (${fmtMetric(offTarget[1])}).`,
      );
    }
  }

  if (best && worst) {
    sentences.push(`Your ${best.label.toLowerCase()} was spot on though — ${fmtMetric(best)}.`);
  }

  if (score >= 90) {
    sentences.push(`Recover well; the engine keeps the progression coming.`);
  } else if (score >= 70) {
    sentences.push(
      `To keep the long-term progression on track, try to stay closer to the session targets — build the volume step by step rather than in jumps.`,
    );
  } else if (score >= 50) {
    sentences.push(
      `No single session breaks the plan, but repeated gaps do — if the targets feel unrealistic, log honestly and the engine will recalibrate them for you.`,
    );
  } else {
    sentences.push(
      `Treat this one as data, not failure: the plan adapts from what you log, so the next sessions will meet you where you are.`,
    );
  }

  return sentences.join(" ");
}

/** Compute the full post-session feedback. Pure and deterministic. */
export function computeSessionFeedback(input: FeedbackInput): SessionFeedback {
  const metrics: MetricComparison[] = [];

  const plannedLoad = input.rpeTarget * input.plannedDurationMin;
  const actualLoad = input.rpeActual * input.actualDurationMin;
  metrics.push(compare("load", "Load", Math.round(actualLoad), Math.round(plannedLoad), "sRPE"));
  metrics.push(
    compare("duration", "Duration", input.actualDurationMin, input.plannedDurationMin, "min"),
  );
  metrics.push(compare("intensity", "Intensity", input.rpeActual, input.rpeTarget, "RPE"));

  if (input.plannedDistanceM != null && input.actualDistanceM != null) {
    metrics.push(compare("distance", "Distance", input.actualDistanceM, input.plannedDistanceM, "m"));
  }
  if (input.targetPaceSecKm != null && input.actualPaceSecKm != null) {
    metrics.push(compare("pace", "Pace", input.actualPaceSecKm, input.targetPaceSecKm, "sec/km"));
  }

  const totalWeight = metrics.reduce((s, m) => s + m.weight, 0);
  const score = Math.round(
    (metrics.reduce((s, m) => s + m.score * m.weight, 0) / totalWeight) * 100,
  );

  return {
    score,
    headline: headlineFor(score),
    coachText: coachTextFor(input, metrics, score),
    metrics,
  };
}
