// ============================================================================
// Nutrition basics per phase (Phase C7, §2 Should-Have): static, originally
// authored content — no medical advice, general sports-nutrition guidance tied
// to what each phase demands. Rendered as a card in the week view.
// ============================================================================
import type { PhaseType } from "@/lib/engine";

export interface NutritionTip {
  headline: string;
  points: string[];
}

export const PHASE_NUTRITION: Record<PhaseType, NutritionTip> = {
  base: {
    headline: "Base: fuel the volume, build habits",
    points: [
      "Eat to support the added volume — a small energy surplus beats under-fueling classic base miles.",
      "Anchor protein at every meal (~1.6–2 g/kg/day) so strength work actually sticks.",
      "Use easy sessions to practice race-day fueling logistics: what sits well, what doesn't.",
    ],
  },
  build: {
    headline: "Build: carbs are training equipment now",
    points: [
      "Periodise carbs with the week: 5–8 g/kg on hard days, less on rest days — fuel the work, not the calendar.",
      "Within 60 min after hard sessions: carbs + protein (~3:1) to keep back-to-back quality days possible.",
      "After a heavy evening session, buffer your bedtime: strength work delays sleep onset, hard endurance fragments the night — both steal the recovery the session was for.",
      "Hydration debt shows up as fake fatigue — check urine color before blaming the plan.",
    ],
  },
  peak: {
    headline: "Peak: rehearse race-day fueling",
    points: [
      "Treat every full simulation as a dress rehearsal: same breakfast, same timing, same drinks as race day.",
      "Keep caffeine strategy consistent — test the dose in a simulation, not on race morning.",
      "Don't diet in peak week; sharpening comes from the taper, not from a deficit.",
    ],
  },
  taper: {
    headline: "Taper & race week: top up, don't stuff",
    points: [
      "Volume drops, so total calories ease down slightly — but keep carbs UP in the last 48–72 h (~8–10 g/kg/day race-week carb load).",
      "Nothing new on race day: no new gels, no new breakfast, no new supplements.",
      "Salt your food in the final days and arrive at the start line hydrated, not water-logged.",
    ],
  },
};
