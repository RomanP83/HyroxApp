// ============================================================================
// What to do when the equipment is not free.
//
// A plan that only works in an empty gym is a plan that gets skipped. The sled
// is taken, the wall-ball corner has a class in it, the rope is in use — and
// today the session simply does not happen, which costs more than any
// substitution ever could.
//
// Two rules shape this file.
//
// 1. **A swap is the athlete's decision, never the engine's.** Nothing here is
//    called while a plan is generated: the plan is deterministic, and these are
//    read at render time against a preference the athlete set. Same inputs,
//    same plan — the substitution is a lens over it.
//
// 2. **Every substitute states what it does NOT replace.** A sled push is a
//    grounded, full-body push against friction with nowhere to hide; a leg
//    press is not that, and pretending otherwise would quietly change what the
//    session trains. Naming the cost is what makes the swap honest rather than
//    a convenience that hollows out the block.
//
// These are training principles applied to the eight stations — patterns,
// loads and what each one develops — not anybody's published programme.
// ============================================================================

import type { EquipmentAccess, Station } from "./types";

/** What a substitute needs to exist at all. */
export type AlternativeNeeds = "gym" | "minimal" | "none";

export interface StationAlternative {
  /** Stable id — this is what gets stored against the profile. */
  slug: string;
  station: Station;
  name: string;
  /** How to actually run it in place of the station. */
  prescription: string;
  /** The part of the station's job it genuinely does. */
  keeps: string;
  /** The part it does not. Stated, because a silent swap is a lie. */
  costs: string;
  needs: AlternativeNeeds;
}

const A = (
  station: Station,
  slug: string,
  name: string,
  prescription: string,
  keeps: string,
  costs: string,
  needs: AlternativeNeeds,
): StationAlternative => ({ station, slug, name, prescription, keeps, costs, needs });

/**
 * Two or three ways to train each station's job without the station.
 *
 * Ordered best-first: the top entry is the closest thing to the real work, and
 * the ones below it trade more away for less equipment.
 */
export const STATION_ALTERNATIVES: Record<Station, StationAlternative[]> = {
  ski_erg: [
    A(
      "ski_erg",
      "ski_row",
      "RowErg, same distance",
      "Row the metres the ski asks for, at the same effort.",
      "The aerobic cost and the pacing discipline, almost exactly.",
      "The overhead pull — your lats and triceps get off lightly.",
      "gym",
    ),
    A(
      "ski_erg",
      "ski_bike",
      "Air bike, double the metres",
      "Twice the distance on the fan bike at the same breathing.",
      "The engine work and the interval structure.",
      "All of the upper body. Treat it as a run session that day.",
      "gym",
    ),
    A(
      "ski_erg",
      "ski_band_pulldown",
      "Banded straight-arm pulldowns, for time",
      "Match the ski's work time in unbroken 40–60 s blocks, short rests.",
      "The straight-arm pull and the shoulder-to-lat fatigue.",
      "The aerobic side — this is local endurance, not an engine session.",
      "minimal",
    ),
  ],
  sled_push: [
    A(
      "sled_push",
      "push_incline_march",
      "Steep treadmill march, loaded",
      "Max incline, weighted vest or dumbbells, 45–60 s per 'length'.",
      "The leg drive, the forward lean and the breathing under load.",
      "The dead-start acceleration — nothing here has to be broken loose.",
      "gym",
    ),
    A(
      "sled_push",
      "push_leg_press",
      "Heavy leg-press clusters",
      "5 × 12–15 heavy, 45 s rest, moving the whole time.",
      "The quad load and the burn that decides the run after it.",
      "The full-body brace and the heart rate. Add a hard 400 m after.",
      "gym",
    ),
    A(
      "sled_push",
      "push_walking_lunge",
      "Heavy walking lunges",
      "Match the sled distance metre for metre, carrying the heaviest load you can walk with.",
      "Loaded legs and a working core, standing up.",
      "The horizontal push. Your calves and glutes do the work instead.",
      "minimal",
    ),
  ],
  sled_pull: [
    A(
      "sled_pull",
      "pull_cable_row",
      "Hand-over-hand cable or band pull",
      "Anchor a heavy band or set a cable low; pull hand over hand for the sled's distance.",
      "The pulling pattern and the grip, close to the real thing.",
      "The load. A rope-pulled sled is far heavier than any cable stack you can brace against.",
      "minimal",
    ),
    A(
      "sled_pull",
      "pull_trap_bar",
      "Trap-bar deadlift clusters",
      "6 × 8 at a load you could keep moving, 60 s rest.",
      "The posterior chain and the braced-back position.",
      "The continuous, gripping, hand-over-hand rhythm.",
      "gym",
    ),
    A(
      "sled_pull",
      "pull_bent_row",
      "Bent-over rows, unbroken sets",
      "5 × 12 heavy, minimal rest, staying hinged between reps.",
      "Back and grip fatigue in the position the pull actually uses.",
      "The legs. The real pull is braced through the floor.",
      "minimal",
    ),
  ],
  burpee_broad_jump: [
    A(
      "burpee_broad_jump",
      "bbj_in_place",
      "Burpee to tuck jump, in place",
      "Same rep count, jumping up instead of forward.",
      "The floor-to-standing cost, which is most of what this station is.",
      "The horizontal travel and the landing that eats your quads.",
      "none",
    ),
    A(
      "burpee_broad_jump",
      "bbj_step_back",
      "Step-back burpee, long stride out",
      "Step down and up rather than jumping; stride forward on standing.",
      "The pattern and the breathing, at a fraction of the impact.",
      "The explosive element. Use it when the knees say so, not when it is convenient.",
      "none",
    ),
  ],
  row: [
    A(
      "row",
      "row_ski",
      "SkiErg, same distance",
      "Ski the metres the row asks for, at the same effort.",
      "The aerobic cost and the pacing.",
      "The leg drive, which is where a good row actually comes from.",
      "gym",
    ),
    A(
      "row",
      "row_bike",
      "Air bike, double the metres",
      "Twice the distance at the same breathing.",
      "The engine work.",
      "The upper back and grip entirely.",
      "gym",
    ),
    A(
      "row",
      "row_swing_pull",
      "Kettlebell swings into bent-over rows",
      "Alternate 40 s swings with 40 s rows for the row's work time, 20 s between.",
      "The hinge, the pull and a heart rate that will not sit still.",
      "The continuity. A 1000 m row is one unbroken effort; this is intervals.",
      "minimal",
    ),
  ],
  farmers_carry: [
    A(
      "farmers_carry",
      "carry_db",
      "Dumbbell or kettlebell carry",
      "Same distance, the heaviest pair you can hold unbroken.",
      "Everything that matters here: grip, trunk, and walking under load.",
      "Almost nothing. Thicker handles would be closer still.",
      "minimal",
    ),
    A(
      "farmers_carry",
      "carry_suitcase",
      "Suitcase carry, one side at a time",
      "Half the distance per hand, swapping without setting the weight down.",
      "Grip, and rather more anti-lean core work than the real thing.",
      "The symmetry — and you only load one side at a time.",
      "minimal",
    ),
    A(
      "farmers_carry",
      "carry_hold",
      "Loaded hold for time",
      "Match the carry's duration in 45–60 s holds, standing tall.",
      "The grip, which is the part that fails first.",
      "The walking, and the breathing that comes with it.",
      "minimal",
    ),
  ],
  sandbag_lunges: [
    A(
      "sandbag_lunges",
      "lunge_back_rack",
      "Barbell back-rack walking lunge",
      "Same distance, a load you can carry the whole way without racking it.",
      "The lunge itself and the load through the trunk.",
      "The bag's shifting weight — a bar is a far more polite thing to carry.",
      "gym",
    ),
    A(
      "sandbag_lunges",
      "lunge_front_rack",
      "Dumbbell front-rack lunge",
      "Same distance, dumbbells held at the shoulders, not by your sides.",
      "The upright torso the sandbag forces, and the shoulder fatigue.",
      "Some of the load — front-rack dumbbells cap out early.",
      "minimal",
    ),
    A(
      "sandbag_lunges",
      "lunge_vest",
      "Weighted-vest walking lunge",
      "Same distance in a vest, hands free.",
      "The distance and the leg cost.",
      "The upper-body carry. This is the easiest of the three — take the distance up.",
      "minimal",
    ),
  ],
  wall_balls: [
    A(
      "wall_balls",
      "wb_thruster",
      "Dumbbell or kettlebell thruster",
      "Same rep count, a load that lets you keep sets of 15–20 together.",
      "The squat-to-overhead cycle and exactly where it burns.",
      "The target. Depth and height stop being judged for you.",
      "minimal",
    ),
    A(
      "wall_balls",
      "wb_no_target",
      "Med-ball squat to press, no wall",
      "Same reps and ball, pressing to full lockout instead of to a target.",
      "Nearly everything — this is the station without the wall.",
      "The rhythm of catching the ball, which is half the skill.",
      "minimal",
    ),
    A(
      "wall_balls",
      "wb_goblet_press",
      "Goblet squat into push press",
      "Same reps, one weight, no bounce out of the bottom.",
      "The leg-to-shoulder handoff under fatigue.",
      "The cycle rate. Deliberately slower — count it as strength work.",
      "minimal",
    ),
  ],
  run: [],
  general: [],
};

/** How much equipment each access level admits. */
const ALLOWED: Record<EquipmentAccess, AlternativeNeeds[]> = {
  full_gym: ["gym", "minimal", "none"],
  hybrid: ["gym", "minimal", "none"],
  home_minimal: ["minimal", "none"],
};

/** The substitutes this athlete could actually do, best first. */
export function alternativesFor(
  station: Station,
  equipment: EquipmentAccess = "full_gym",
): StationAlternative[] {
  const allowed = ALLOWED[equipment] ?? ALLOWED.full_gym;
  return (STATION_ALTERNATIVES[station] ?? []).filter((a) => allowed.includes(a.needs));
}

/** One substitute by its stored slug, or null when the slug is unknown. */
export function findAlternative(slug: string): StationAlternative | null {
  for (const list of Object.values(STATION_ALTERNATIVES)) {
    const hit = list.find((a) => a.slug === slug);
    if (hit) return hit;
  }
  return null;
}

/**
 * The substitutions an athlete has standing, cleaned of anything unknown.
 *
 * Stored per station rather than per session on purpose. "There is no sled in
 * my gym" is a fact about the gym, not about Tuesday, and a preference that
 * survives every rebuild by simply not being part of the plan. A one-off — the
 * corner is busy today — is the same two taps in reverse.
 */
export function resolveSubstitutions(
  raw: Record<string, string> | null | undefined,
): Partial<Record<Station, StationAlternative>> {
  const out: Partial<Record<Station, StationAlternative>> = {};
  for (const [station, slug] of Object.entries(raw ?? {})) {
    const alt = findAlternative(slug);
    if (alt && alt.station === station) out[station as Station] = alt;
  }
  return out;
}
