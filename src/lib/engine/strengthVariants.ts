// ============================================================================
// Strength sessions, by phase — and the finishers that carry two must-dos the
// plan had no home for.
//
// Hyrox strength is built on heavy compound lifts in the low single digits, not
// on endless repetition work; the taper trades load for speed. And two things
// only work in a RESTED state, which is why they hang off a strength day rather
// than off a run or a station circuit:
//
//   plyometrics — tendon stiffness and running economy (and the burpee broad
//                 jump). Jumping under fatigue trains something else.
//   grip        — the quiet reason sleds, carries and lunges fall apart.
// ============================================================================

import { pickVariant, type SessionVariant, type VariantPick, type VariantQuery } from "./runVariants";
import type { PhaseType } from "./types";

export type StrengthVariant = SessionVariant & { session_type: "strength" };

export const STRENGTH_VARIANTS: StrengthVariant[] = [
  {
    slug: "str_max_strength",
    session_type: "strength",
    name: "Maximal Strength",
    phases: ["base", "build"],
    keywords: ["kraft", "strength", "squat", "deadlift", "maximal"],
    why: "Heavy compound lifts in the low single digits (4×3, 3×3) — the force everything else is rendered from.",
  },
  {
    slug: "str_posterior",
    session_type: "strength",
    name: "Posterior Chain",
    phases: ["base", "build"],
    keywords: ["rücken", "back", "hüfte", "hip", "deadlift", "posterior"],
    why: "Deadlift-led work for the hinge — the pattern behind sled pull, burpee broad jumps and every carry.",
  },
  {
    slug: "str_push_pull",
    session_type: "strength",
    name: "Upper Push-Pull",
    phases: ["base", "build", "peak"],
    keywords: ["oberkörper", "upper", "schulter", "shoulder", "ski", "wall"],
    why: "Press and pull strength for the ski, the wall balls and the rope — the stations that live above the waist.",
  },
  {
    slug: "str_lower_max",
    session_type: "strength",
    name: "Lower Body Strength",
    phases: ["peak"],
    keywords: ["bein", "leg", "quad", "squat"],
    why: "Squat-led work held at moderate volume — strength is maintained while the running does the sharpening.",
  },
  {
    slug: "str_power_primer",
    session_type: "strength",
    name: "Power Primer",
    phases: ["taper"],
    why: "Light and fast: speed off the floor and a handful of jumps. Nothing is emptied in race week.",
  },
];

/** Finishers that hang off a strength session, in a rested state. */
export interface StrengthFinisher {
  slug: string;
  name: string;
  /** Weeks it appears on, as a rotation among the finishers. */
  why: string;
}

export const STRENGTH_FINISHERS: StrengthFinisher[] = [
  {
    slug: "fin_plyo_tendon",
    name: "Plyometrics",
    why: "Broad and pogo jumps while you are fresh — tendon stiffness for the burpee broad jumps and for running economy.",
  },
  {
    slug: "fin_grip_dedicated",
    name: "Grip",
    why: "Dead hangs and heavy holds — grip is what quietly ends sleds, carries and lunges.",
  },
  {
    slug: "fin_core",
    name: "Core",
    why: "Braced positions for the carries and the lunges.",
  },
];

/**
 * Which finisher a strength session carries this week. Plyometrics and grip
 * alternate ahead of core: they are the two must-dos, core is the filler.
 */
export function pickStrengthFinisher(weekNumber: number, phase: PhaseType): StrengthFinisher {
  // Race week is for priming, not for another stimulus.
  if (phase === "taper") return STRENGTH_FINISHERS[2];
  return STRENGTH_FINISHERS[(weekNumber - 1) % 2];
}

export function pickStrengthVariant(opts: VariantQuery): VariantPick<StrengthVariant> | null {
  return pickVariant(STRENGTH_VARIANTS, opts);
}
