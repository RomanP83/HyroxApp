// ============================================================================
// "Warum diese Woche?" generator (Implementation Plan §2 / §4)
// Deterministic, template-based — no LLM in the plan core ("lazy AI" is the
// literal complaint against competitors, PP1). Makes periodisation *visible*.
// ============================================================================

import type { PhaseType } from "./types";

interface WeeklyGoalInput {
  phase: PhaseType;
  weekInPhase: number; // 1-based index within the phase
  phaseLength: number;
  isDeload: boolean;
  isBenchmark: boolean;
  weeksToRace: number;
}

export function weeklyGoal(input: WeeklyGoalInput): string {
  const { phase, weekInPhase, phaseLength, isDeload, isBenchmark, weeksToRace } = input;

  if (isBenchmark) {
    return `Benchmark week: we re-test 1–2 key efforts so progress is provable and your pace zones + finish-time estimate recalibrate on real numbers, not guesses.`;
  }
  if (isDeload) {
    return `Planned deload (volume cut ~40%). Fatigue has accumulated over the last block — this week lets adaptation catch up so the next hard week actually lands. Missing a deload is exactly what makes "random" plans stall.`;
  }

  const position =
    weekInPhase === 1
      ? "opens"
      : weekInPhase === phaseLength
        ? "closes"
        : "builds through";

  switch (phase) {
    case "base":
      return `Base phase, week ${weekInPhase}/${phaseLength}. This week ${position} your aerobic foundation: controlled running volume plus station technique. We keep intensity honest now so there's headroom to push later — with ${weeksToRace} weeks to race, patience compounds.`;
    case "build":
      return `Build phase, week ${weekInPhase}/${phaseLength}. Race specificity rises: compromised running (running on tired legs) and heavier station work move to the front. ${weeksToRace} weeks out, this is where Hyrox fitness is actually forged.`;
    case "peak":
      return `Peak phase, week ${weekInPhase}/${phaseLength}. Volume plateaus while intensity peaks — full simulations and race-pace efforts sharpen the specific engine. Only ${weeksToRace} weeks left; every session rehearses race day.`;
    case "taper":
      return `Taper. Volume drops sharply but intensity stays crisp so you arrive fresh, not flat. Trust the cut — the work is already banked. Race day is ${weeksToRace} week(s) out.`;
  }
}
