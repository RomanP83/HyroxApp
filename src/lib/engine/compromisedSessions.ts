// ============================================================================
// Compromised running, level by level and phase by phase.
//
// Compromised running trains one thing: holding running economy and
// neuromuscular control while a station has already emptied the legs locally.
// What that means in metres and pace is not one prescription — it is twenty,
// because a sub-2:00 athlete and a sub-60 athlete are not doing the same sport
// at the same speed.
//
// These live in TypeScript rather than in workout_blocks because they are
// ENGINE data, like RUN_SPECS: distances, paces and loads that get argued with
// and tuned. They render into exactly the content shape BlockView already
// draws, so the session card needs to know nothing about any of this.
//
// Three sessions per (level, phase). The picker rotates them by week and, on
// alternating weeks, prefers the one that attacks the athlete's weakest
// station — the same rule the other variant catalogues follow.
// ============================================================================

import type {
  EquipmentAccess,
  ExperienceLevel,
  PhaseType,
  Station,
  StationTiers,
} from "./types";

/** One line of a session, in the shape BlockView renders. */
export interface SessionLine {
  exercise: string;
  sets?: number;
  reps?: number;
  distance_m?: number;
  rest_sec?: number;
  load_by_division?: Record<string, string>;
  /**
   * This line is running, not erg metres or a carry. The distinction matters:
   * a session's ski and row metres are not the athlete's weekly mileage.
   */
  is_run?: boolean;
}

export interface CompromisedSession {
  slug: string;
  /**
   * How many times through `lines`. Data, not prose: without it nothing can
   * work out how far a session actually runs, and the round count would drift
   * away from the text describing it.
   */
  rounds: number;
  /** Rest between rounds, when the prescription names one. */
  rest_between_rounds_sec?: number;
  level: ExperienceLevel;
  phase: PhaseType;
  name: string;
  /** One line on the card: what this shape is for. */
  why: string;
  /** The station this hammers — drives the weakness bias. */
  station?: Station;
  /** Needs a SkiErg / RowErg to run at all. */
  needs_erg?: boolean;
  lines: SessionLine[];
}

const run = (distance_m: number, exercise: string): SessionLine => ({
  exercise,
  distance_m,
  is_run: true,
});
const work = (exercise: string, extra: Partial<SessionLine> = {}): SessionLine => ({
  exercise,
  ...extra,
});

export const COMPROMISED_SESSIONS: CompromisedSession[] = [
  // ══ Level 1 — Beginner (sub 1:40–2:00) ══════════════════════════════════
  {
    slug: "cr_b1_squat_sandwich",
    level: "beginner",
    phase: "base",
    name: "Squat Sandwich",
    why: "The gentlest introduction: a light leg load between two easy runs, so the legs learn the handover before anything is heavy.",
    rounds: 3,
    rest_between_rounds_sec: 120,
    lines: [
      run(400, "Zone 2 run"),
      work("Goblet squats, light", { reps: 15 }),
      run(400, "Zone 2 run"),
    ],
  },
  {
    slug: "cr_b1_ski_to_run",
    level: "beginner",
    phase: "base",
    name: "Ski into Run",
    why: "Arms first, then legs. The SkiErg raises the heart rate without any impact, so the run starts already breathing hard.",
    station: "ski_erg",
    needs_erg: true,
    rounds: 4,
    lines: [
      work("SkiErg, aerobic — steady, not a sprint", { distance_m: 250 }),
      run(500, "Zone 2 run, straight off the erg"),
    ],
  },
  {
    slug: "cr_b1_light_sled",
    level: "beginner",
    phase: "base",
    name: "Light Sled & Jog",
    why: "First contact with the sled-to-run handover, at a weight that lets the jog stay a jog.",
    station: "sled_push",
    rounds: 3,
    lines: [
      work("Sled push, light", {
        distance_m: 20,
        load_by_division: { open: "50 kg", pro: "75 kg" },
      }),
      run(600, "Easy jog — let the legs come back"),
    ],
  },
  {
    slug: "cr_b2_deadlift_burpee",
    level: "beginner",
    phase: "build",
    name: "Deadlift & Burpee Brick",
    why: "Two loads on top of a Zone 3-4 run: the first week the run afterwards feels like someone else's legs.",
    rounds: 4,
    rest_between_rounds_sec: 90,
    lines: [
      run(500, "Run, Zone 3-4"),
      work("Kettlebell deadlifts", { reps: 12, load_by_division: { open: "24 kg", pro: "32 kg" } }),
      work("Burpees", { reps: 10 }),
    ],
  },
  {
    slug: "cr_b2_lunge_to_pace",
    level: "beginner",
    phase: "build",
    name: "Lunges into Race Pace",
    why: "Lunges are what actually ends a first Hyrox. Running race pace straight off them is the whole point.",
    station: "sandbag_lunges",
    rounds: 3,
    rest_between_rounds_sec: 120,
    lines: [
      work("Sandbag lunges, light", {
        distance_m: 40,
        load_by_division: { open: "10 kg", pro: "20 kg" },
      }),
      run(800, "Run at race pace, immediately"),
    ],
  },
  {
    slug: "cr_b2_row_lunge_run",
    level: "beginner",
    phase: "build",
    name: "Row, Lunge, Run",
    why: "Three systems in a row — pull, legs, run — at a volume that still lets the form hold.",
    station: "row",
    needs_erg: true,
    rounds: 4,
    lines: [
      work("Row", { distance_m: 250 }),
      work("Walking lunges", { distance_m: 20 }),
      run(500, "Run"),
    ],
  },
  {
    slug: "cr_b3_mini_sim",
    level: "beginner",
    phase: "peak",
    name: "Mini Simulation",
    why: "A quarter of the race, in race order. Long enough to rehearse pacing, short enough to recover from in a day.",
    station: "wall_balls",
    needs_erg: true,
    rounds: 2,
    lines: [
      run(1000, "Run at race pace"),
      work("SkiErg", { distance_m: 500 }),
      run(1000, "Run at race pace"),
      work("Wall balls", { reps: 20, load_by_division: { open: "6 kg", pro: "9 kg" } }),
    ],
  },
  {
    slug: "cr_b3_carry_jump_run",
    level: "beginner",
    phase: "peak",
    name: "Carry, Jump, Run",
    why: "Grip and explosive work stacked in front of a full race-pace kilometre — the hardest handover in the race.",
    station: "burpee_broad_jump",
    rounds: 3,
    lines: [
      work("Farmers carry", {
        distance_m: 50,
        load_by_division: { open: "2×16 kg", pro: "2×24 kg" },
      }),
      work("Burpee broad jumps", { reps: 15 }),
      run(1000, "Run at race pace, no walk-in"),
    ],
  },
  {
    slug: "cr_b3_half_sim",
    level: "beginner",
    phase: "peak",
    name: "Half Simulation",
    why: "Four kilometres, four stations, race order. The dress rehearsal that costs a day instead of three.",
    needs_erg: true,
    rounds: 1,
    lines: [
      work("Four runs, each broken by the next station in race order"),
      run(1000, "Run 1 → SkiErg 1000 m"),
      run(1000, "Run 2 → Sled push 50 m"),
      run(1000, "Run 3 → Sled pull 50 m"),
      run(1000, "Run 4 → Burpee broad jumps 80 m"),
    ],
  },
  {
    slug: "cr_b4_short_sharp",
    level: "beginner",
    phase: "taper",
    name: "Short & Sharp",
    why: "Race pace touched, nothing emptied. Race week is for reminding the legs, not teaching them.",
    station: "wall_balls",
    rounds: 2,
    lines: [
      run(400, "Run at race pace"),
      work("Wall balls", { reps: 10, load_by_division: { open: "6 kg", pro: "9 kg" } }),
      run(400, "Run at easy"),
    ],
  },
  {
    slug: "cr_b4_transition_drill",
    level: "beginner",
    phase: "taper",
    name: "Transition Tempo",
    why: "The roxzone is where beginners lose minutes. This rehearses the handover, not the fatigue.",
    station: "ski_erg",
    needs_erg: true,
    rounds: 3,
    lines: [
      work("SkiErg", { distance_m: 200 }),
      run(500, "Run at race pace — focus on how fast you get moving"),
    ],
  },
  {
    slug: "cr_b4_single_rehearsal",
    level: "beginner",
    phase: "taper",
    name: "One Clean Rehearsal",
    why: "One kilometre at race pace, one light sled, done. The last quality touch before the start.",
    station: "sled_push",
    rounds: 1,
    lines: [
      run(1000, "Run at race pace"),
      work("Sled push, light", {
        distance_m: 20,
        load_by_division: { open: "50 kg", pro: "75 kg" },
      }),
      run(500, "Cool-down run"),
    ],
  },

  // ══ Level 2 — Intermediate (sub 1:30) ═══════════════════════════════════
  {
    slug: "cr_i1_squat_row",
    level: "intermediate",
    phase: "base",
    name: "Squat & Row Aerobic",
    why: "Aerobic volume with two interruptions — the base block's job is capacity, not pain.",
    station: "row",
    needs_erg: true,
    rounds: 4,
    lines: [
      run(800, "Zone 2 run"),
      work("Air squats", { reps: 20 }),
      work("Row, aerobic", { distance_m: 200 }),
    ],
  },
  {
    slug: "cr_i1_ski_sled_run",
    level: "intermediate",
    phase: "base",
    name: "Ski, Sled, Run",
    why: "Both ergs and the sled at 60% of race weight, then an easy kilometre: the full chain at a load the base can absorb.",
    station: "sled_push",
    needs_erg: true,
    rounds: 3,
    lines: [
      work("SkiErg", { distance_m: 500 }),
      work("Sled push at 60% of race weight", {
        distance_m: 30,
        load_by_division: { open: "90 kg", pro: "120 kg" },
      }),
      run(800, "Zone 2 run"),
    ],
  },
  {
    slug: "cr_i1_carry_kilometre",
    level: "intermediate",
    phase: "base",
    name: "Carry Kilometres",
    why: "A full kilometre before every carry — grip endurance built on top of an already-working aerobic system.",
    station: "farmers_carry",
    rounds: 4,
    lines: [
      run(1000, "Run at zone 2 to low Zone 3"),
      work("Farmers walk, moderate", {
        distance_m: 40,
        load_by_division: { open: "2×20 kg", pro: "2×28 kg" },
      }),
    ],
  },
  {
    slug: "cr_i2_sled_threshold",
    level: "intermediate",
    phase: "build",
    name: "Sled into Threshold",
    why: "Race weight on the sled, then a threshold kilometre with no transition. This is the session that moves a sub-1:30.",
    station: "sled_push",
    rounds: 4,
    lines: [
      work("Sled push at race weight", {
        distance_m: 30,
        load_by_division: { open: "152 kg", pro: "202 kg" },
      }),
      run(1000, "Run at threshold, Zone 4 — straight off the sled"),
    ],
  },
  {
    slug: "cr_i2_row_bbj_5k",
    level: "intermediate",
    phase: "build",
    name: "Row, Jumps, 5k Pace",
    why: "Burpee broad jumps wreck a running rhythm more than anything else in the race. Running 5k pace after them is the repair.",
    station: "burpee_broad_jump",
    needs_erg: true,
    rounds: 3,
    rest_between_rounds_sec: 90,
    lines: [
      work("Row", { distance_m: 500 }),
      work("Burpee broad jumps", { reps: 20 }),
      run(800, "Run at 5k pace"),
    ],
  },
  {
    slug: "cr_i2_lunge_race_pace",
    level: "intermediate",
    phase: "build",
    name: "Race-Weight Lunges",
    why: "Fifty metres of loaded lunges at race weight, then a race-pace kilometre — the exact handover of station seven.",
    station: "sandbag_lunges",
    rounds: 4,
    lines: [
      work("Sandbag lunges at race weight", {
        distance_m: 50,
        load_by_division: { open: "20 kg", pro: "30 kg" },
      }),
      run(1000, "Run at race pace"),
    ],
  },
  {
    slug: "cr_i3_sled_sandwich",
    level: "intermediate",
    phase: "peak",
    name: "Sled Sandwich",
    why: "Two race-pace kilometres around a full sled push, finished on wall balls. Race density, in three rounds.",
    station: "wall_balls",
    rounds: 3,
    lines: [
      run(1000, "Run at race pace"),
      work("Sled push", { distance_m: 50, load_by_division: { open: "152 kg", pro: "202 kg" } }),
      run(1000, "Run at race pace"),
      work("Wall balls", { reps: 25, load_by_division: { open: "6 kg", pro: "9 kg" } }),
    ],
  },
  {
    slug: "cr_i3_ski_carry_chain",
    level: "intermediate",
    phase: "peak",
    name: "Ski & Carry Chain",
    why: "Run, ski, carry, four times over: the upper body never gets a break and the run has to hold anyway.",
    station: "farmers_carry",
    needs_erg: true,
    rounds: 4,
    lines: [
      run(1000, "Run at race pace"),
      work("SkiErg", { distance_m: 500 }),
      work("Farmers carry", {
        distance_m: 100,
        load_by_division: { open: "2×24 kg", pro: "2×32 kg" },
      }),
    ],
  },
  {
    slug: "cr_i3_brick_density",
    level: "intermediate",
    phase: "peak",
    name: "Brick Density",
    why: "Five short rounds above race pace with the two most rhythm-breaking stations. Density, not distance.",
    station: "burpee_broad_jump",
    rounds: 5,
    lines: [
      run(600, "Run at above race pace"),
      work("Burpee broad jumps", { reps: 15 }),
      work("Wall balls", { reps: 15, load_by_division: { open: "6 kg", pro: "9 kg" } }),
    ],
  },
  {
    slug: "cr_i4_row_sandwich",
    level: "intermediate",
    phase: "taper",
    name: "Row Sandwich",
    why: "Race pace in, Zone 2 out. Sharp without a bill to pay.",
    station: "row",
    needs_erg: true,
    rounds: 3,
    lines: [
      run(500, "Run at race pace"),
      work("Row", { distance_m: 250 }),
      run(500, "Run at zone 2"),
    ],
  },
  {
    slug: "cr_i4_sharpening_sled",
    level: "intermediate",
    phase: "taper",
    name: "Sharpening Sled",
    why: "A short sled to wake the pattern up — stop well short of failure, this is a reminder, not a session.",
    station: "sled_push",
    rounds: 2,
    lines: [
      run(1000, "Run at race pace"),
      work("Sled push — sharpening, never to failure", {
        distance_m: 20,
        load_by_division: { open: "152 kg", pro: "202 kg" },
      }),
    ],
  },
  {
    slug: "cr_i4_over_pace_touch",
    level: "intermediate",
    phase: "taper",
    name: "Over-Pace Touches",
    why: "Three fast 400s with a handful of wall balls between them: speed on race week, volume nowhere near it.",
    station: "wall_balls",
    rounds: 1,
    lines: [
      work("Three efforts, full recovery between"),
      run(400, "Run at above race pace"),
      work("Wall balls between efforts", {
        reps: 10,
        load_by_division: { open: "6 kg", pro: "9 kg" },
      }),
    ],
  },

  // ══ Level 3 — Advanced (sub 1:20) ═══════════════════════════════════════
  {
    slug: "cr_a1_ski_carry_volume",
    level: "advanced",
    phase: "base",
    name: "Ski & Heavy Carry Volume",
    why: "Five rounds of aerobic running with an erg and a heavy carry on top — capacity work, at a volume the base block is for.",
    station: "farmers_carry",
    needs_erg: true,
    rounds: 5,
    lines: [
      run(1000, "Zone 2 run"),
      work("SkiErg, aerobic", { distance_m: 500 }),
      work("Heavy kettlebell carry", {
        distance_m: 40,
        load_by_division: { open: "2×28 kg", pro: "2×32 kg" },
      }),
    ],
  },
  {
    slug: "cr_a1_double_sled",
    level: "advanced",
    phase: "base",
    name: "Heavy Sled Double",
    why: "Push and pull back to back, four times, with a run between. The base block is where the sled stops being frightening.",
    station: "sled_pull",
    rounds: 4,
    lines: [
      run(800, "Run"),
      work("Heavy sled push", {
        distance_m: 30,
        load_by_division: { open: "175 kg", pro: "225 kg" },
      }),
      work("Heavy sled pull", {
        distance_m: 30,
        load_by_division: { open: "125 kg", pro: "175 kg" },
      }),
    ],
  },
  {
    slug: "cr_a1_long_z2_brick",
    level: "advanced",
    phase: "base",
    name: "Long Zone-2 Brick",
    why: "Fifteen hundred metres before every interruption: the aerobic engine leads, the strength work rides along.",
    station: "row",
    needs_erg: true,
    rounds: 3,
    lines: [
      run(1500, "Zone 2 run"),
      work("Goblet squats", { reps: 30, load_by_division: { open: "24 kg", pro: "32 kg" } }),
      work("Row", { distance_m: 500 }),
    ],
  },
  {
    slug: "cr_a2_sled_pace_discipline",
    level: "advanced",
    phase: "build",
    name: "Sled & Pace Discipline",
    why: "Full competition weight, then a threshold kilometre held at 4:45–5:00 min/km. The pace is the test, not the sled.",
    station: "sled_push",
    rounds: 4,
    lines: [
      work("Sled push at competition weight", {
        distance_m: 50,
        load_by_division: { open: "152 kg", pro: "202 kg" },
      }),
      run(1000, "Run at threshold — hold 4:45-5:00 min/km, no faster off the sled"),
    ],
  },
  {
    slug: "cr_a2_row_lunge_race",
    level: "advanced",
    phase: "build",
    name: "Row, Lunges, Race Pace",
    why: "A race-pace row and sixty metres of lunges before the kilometre. Legs already gone when the run starts.",
    station: "sandbag_lunges",
    needs_erg: true,
    rounds: 3,
    rest_between_rounds_sec: 120,
    lines: [
      work("Row at race pace", { distance_m: 500 }),
      work("Sandbag lunges", {
        distance_m: 60,
        load_by_division: { open: "20 kg", pro: "30 kg" },
      }),
      run(1000, "Run at race pace"),
    ],
  },
  {
    slug: "cr_a2_jumps_walls_5k",
    level: "advanced",
    phase: "build",
    name: "Jumps, Walls, 5k Pace",
    why: "The two stations that shred a running rhythm, then 5k pace. If the pace survives this, it survives the race.",
    station: "burpee_broad_jump",
    rounds: 4,
    lines: [
      work("Burpee broad jumps", { reps: 20 }),
      work("Wall balls", { reps: 25, load_by_division: { open: "6 kg", pro: "9 kg" } }),
      run(1000, "Run at 5k pace"),
    ],
  },
  {
    slug: "cr_a3_split_consistency",
    level: "advanced",
    phase: "peak",
    name: "Split Consistency",
    why: "Four rounds, two kilometres each, with push and pull between. The target is not speed — it is five seconds of variance across every run split.",
    station: "sled_pull",
    rounds: 4,
    lines: [
      run(1000, "Run at race pace — note the split"),
      work("Sled push", { distance_m: 50, load_by_division: { open: "152 kg", pro: "202 kg" } }),
      run(1000, "Run at race pace — within 5 s of the first"),
      work("Sled pull", { distance_m: 50, load_by_division: { open: "103 kg", pro: "153 kg" } }),
    ],
  },
  {
    slug: "cr_a3_race_intensity_chain",
    level: "advanced",
    phase: "peak",
    name: "Race-Intensity Chain",
    why: "Run, ski, carry, fifty wall balls — all at race intensity. The back half of the race, rehearsed three times.",
    station: "wall_balls",
    needs_erg: true,
    rounds: 3,
    lines: [
      run(1000, "Run at race pace"),
      work("SkiErg", { distance_m: 500 }),
      work("Farmers carry", {
        distance_m: 100,
        load_by_division: { open: "2×24 kg", pro: "2×32 kg" },
      }),
      work("Wall balls at race intensity", {
        reps: 50,
        load_by_division: { open: "6 kg", pro: "9 kg" },
      }),
    ],
  },
  {
    slug: "cr_a3_pacing_stress",
    level: "advanced",
    phase: "peak",
    name: "Pacing Stress",
    why: "Six 800s at 5-10 s per kilometre faster than race pace, alternating the two stations that take the legs. This is where pacing discipline is proved or lost.",
    station: "sandbag_lunges",
    rounds: 1,
    lines: [
      work("Six efforts, alternating the station between them"),
      run(800, "Run 5-10 s/km faster than race pace"),
      work("Lunges (odd rounds)", {
        distance_m: 40,
        load_by_division: { open: "20 kg", pro: "30 kg" },
      }),
      work("Burpee broad jumps (even rounds)", { reps: 20 }),
    ],
  },
  {
    slug: "cr_a4_ski_sandwich",
    level: "advanced",
    phase: "taper",
    name: "Ski Sandwich",
    why: "Race pace in, easy out, three times. Enough to stay sharp, not enough to cost anything.",
    station: "ski_erg",
    needs_erg: true,
    rounds: 3,
    lines: [
      run(600, "Run at race pace"),
      work("SkiErg", { distance_m: 250 }),
      run(400, "Run at zone 2"),
    ],
  },
  {
    slug: "cr_a4_kilometre_touch",
    level: "advanced",
    phase: "taper",
    name: "Race-Pace Touch",
    why: "Two clean kilometres with a short sled and a handful of wall balls. The pattern, not the fatigue.",
    station: "sled_push",
    rounds: 2,
    lines: [
      run(1000, "Run at race pace"),
      work("Sled push, short", {
        distance_m: 25,
        load_by_division: { open: "152 kg", pro: "202 kg" },
      }),
      work("Wall balls", { reps: 15, load_by_division: { open: "6 kg", pro: "9 kg" } }),
    ],
  },
  {
    slug: "cr_a4_roxzone_drills",
    level: "advanced",
    phase: "taper",
    name: "Roxzone Drills",
    why: "Four accelerations and the transitions between them. Race week is the right week to shave seconds off the roxzone.",
    rounds: 1,
    lines: [
      work("Four accelerations with a full transition rehearsal after each"),
      run(300, "Run: accelerate to race pace and beyond"),
      work("Transition drill — into and out of the station area, fast"),
    ],
  },

  // ══ Level 4 — Elite (sub 70 min) ════════════════════════════════════════
  {
    slug: "cr_e1_ski_drag_volume",
    level: "elite",
    phase: "base",
    name: "Ski & Drag Volume",
    why: "Five rounds of 1200 m with an erg and a drag. At this level the base block still runs long — the interruptions just get heavier.",
    station: "ski_erg",
    needs_erg: true,
    rounds: 5,
    lines: [
      run(1200, "Zone 2 run"),
      work("SkiErg, aerobic", { distance_m: 500 }),
      work("Sled drag", { distance_m: 50, load_by_division: { open: "103 kg", pro: "153 kg" } }),
    ],
  },
  {
    slug: "cr_e1_heavy_double_sled",
    level: "elite",
    phase: "base",
    name: "Heavy Double Sled",
    why: "Overload on both sleds behind a full kilometre. Base is where the sled stops being the limiter.",
    station: "sled_push",
    rounds: 4,
    lines: [
      run(1000, "Run"),
      work("Heavy sled push", {
        distance_m: 40,
        load_by_division: { open: "120+ kg", pro: "180+ kg" },
      }),
      work("Heavy sled pull", {
        distance_m: 40,
        load_by_division: { open: "120 kg", pro: "160 kg" },
      }),
    ],
  },
  {
    slug: "cr_e1_long_aerobic_chain",
    level: "elite",
    phase: "base",
    name: "Long Aerobic Chain",
    why: "Two kilometres, a full row, a hundred metres of carry — the longest aerobic block in the catalogue, three times over.",
    station: "farmers_carry",
    needs_erg: true,
    rounds: 3,
    lines: [
      run(2000, "Zone 2 run"),
      work("Row", { distance_m: 1000 }),
      work("Farmers carry", { distance_m: 100, load_by_division: { open: "2×32 kg", pro: "2×32 kg" } }),
    ],
  },
  {
    slug: "cr_e2_lactate_accumulation",
    level: "elite",
    phase: "build",
    name: "Lactate Accumulation",
    why: "Maximum pressure on the sled, then a kilometre at 4:15–4:25 with no transition at all. The session exists to make lactate and run through it.",
    station: "sled_push",
    rounds: 4,
    lines: [
      work("Sled push, maximum pressure", {
        distance_m: 50,
        load_by_division: { open: "152 kg", pro: "202 kg" },
      }),
      run(1000, "Run at 4:15-4:25 min/km — no transition, straight into it"),
    ],
  },
  {
    slug: "cr_e2_row_bbj_subthreshold",
    level: "elite",
    phase: "build",
    name: "Row, Jumps, Sub-Threshold",
    why: "A race-pace row and twenty-five broad jumps in front of a sub-threshold kilometre. Three minutes back, then again.",
    station: "burpee_broad_jump",
    needs_erg: true,
    rounds: 4,
    rest_between_rounds_sec: 180,
    lines: [
      work("Row at race pace", { distance_m: 500 }),
      work("Burpee broad jumps", { reps: 25 }),
      run(1000, "Run at sub-threshold"),
    ],
  },
  {
    slug: "cr_e2_lunge_split_drift",
    level: "elite",
    phase: "build",
    name: "Lunge & Split Drift",
    why: "Eighty metres of loaded lunges before every kilometre, and the split is allowed to drift by five seconds across the whole session. That constraint is the session.",
    station: "sandbag_lunges",
    rounds: 4,
    lines: [
      work("Sandbag lunges", {
        distance_m: 80,
        load_by_division: { open: "20 kg", pro: "30 kg" },
      }),
      run(1000, "Run — splits may drift by 5 s across the session, no more"),
    ],
  },
  {
    slug: "cr_e3_race_density",
    level: "elite",
    phase: "peak",
    name: "Race Density",
    why: "Four kilometres and four stations per round, three rounds. The closest thing to the race that is not the race.",
    station: "sled_pull",
    needs_erg: true,
    rounds: 3,
    lines: [
      work("Row", { distance_m: 500 }),
      run(1000, "Run at race pace"),
      work("Sled push", { distance_m: 50, load_by_division: { open: "152 kg", pro: "202 kg" } }),
      run(1000, "Run at race pace"),
      work("Sled pull", { distance_m: 50, load_by_division: { open: "103 kg", pro: "153 kg" } }),
      run(1000, "Run at race pace"),
      work("Burpee broad jumps", { reps: 25 }),
      run(1000, "Run at race pace"),
    ],
  },
  {
    slug: "cr_e3_lactate_washout",
    level: "elite",
    phase: "peak",
    name: "Lactate Washout",
    why: "A kilometre at 4:05, then thirty wall balls unbroken. Five times. The wall balls are where the race is decided at this level.",
    station: "wall_balls",
    rounds: 5,
    rest_between_rounds_sec: 120,
    lines: [
      run(1000, "Run at 4:05 min/km"),
      work("Wall balls, unbroken", {
        reps: 30,
        load_by_division: { open: "6 kg", pro: "9 kg" },
      }),
    ],
  },
  {
    slug: "cr_e3_high_velocity_brick",
    level: "elite",
    phase: "peak",
    name: "High-Velocity Brick",
    why: "Six 800s under 3:20, straight into a rotating station each time. Speed that has to survive being interrupted.",
    station: "farmers_carry",
    needs_erg: true,
    rounds: 1,
    lines: [
      work("Six efforts, the station rotates between them"),
      run(800, "Run at under 3:20"),
      work("Farmers carry (round 1, 4)", {
        distance_m: 200,
        load_by_division: { open: "2×24 kg", pro: "2×32 kg" },
      }),
      work("Lunges (round 2, 5)", {
        distance_m: 50,
        load_by_division: { open: "20 kg", pro: "30 kg" },
      }),
      work("SkiErg (round 3, 6)", { distance_m: 500 }),
    ],
  },
  {
    slug: "cr_e4_race_pace_ski",
    level: "elite",
    phase: "taper",
    name: "Race Pace & Ski",
    why: "Three rounds at 4:15 with a short erg and ten wall balls. Everything at race feel, nothing at race cost.",
    station: "ski_erg",
    needs_erg: true,
    rounds: 3,
    lines: [
      run(800, "Run at race pace, 4:15 min/km"),
      work("SkiErg", { distance_m: 250 }),
      work("Wall balls", { reps: 10, load_by_division: { open: "6 kg", pro: "9 kg" } }),
    ],
  },
  {
    slug: "cr_e4_neuromuscular_sled",
    level: "elite",
    phase: "taper",
    name: "Neuromuscular Sled",
    why: "A short sled at 80% — this is a nervous-system wake-up, not a strength session. Stop while it still feels easy.",
    station: "sled_push",
    rounds: 2,
    lines: [
      run(1000, "Run at race pace"),
      work("Sled push at 80% — activation, not fatigue", {
        distance_m: 25,
        load_by_division: { open: "122 kg", pro: "162 kg" },
      }),
    ],
  },
  {
    slug: "cr_e4_explosive_touch",
    level: "elite",
    phase: "taper",
    name: "Explosive Touch",
    why: "Four 400s at race pace with five explosive jumps each. The last CNS reminder before race day.",
    station: "burpee_broad_jump",
    rounds: 1,
    lines: [
      work("Four efforts, full recovery between"),
      run(400, "Run at race pace"),
      work("Burpee broad jumps, explosive", { reps: 5 }),
    ],
  },

  // ══ Level 5 — World Class (sub 60 min) ══════════════════════════════════
  {
    slug: "cr_w1_ski_carry_volume",
    level: "world_class",
    phase: "base",
    name: "Ski & Carry Volume",
    why: "Six rounds with a full kilometre on the erg and sixty metres of heavy carry. The base block at this level is other people's race.",
    station: "ski_erg",
    needs_erg: true,
    rounds: 6,
    lines: [
      run(1200, "Zone 2 run"),
      work("SkiErg, aerobic", { distance_m: 1000 }),
      work("Heavy carry", { distance_m: 60, load_by_division: { open: "2×32 kg", pro: "2×32 kg" } }),
    ],
  },
  {
    slug: "cr_w1_overload_sled",
    level: "world_class",
    phase: "base",
    name: "Overload Sled",
    why: "Five rounds at 150+ kg behind an aerobic-threshold kilometre. Overload now so race weight feels like nothing in March.",
    station: "sled_push",
    rounds: 5,
    lines: [
      run(1000, "Run at aerobic threshold"),
      work("Heavy overload sled push", {
        distance_m: 50,
        load_by_division: { open: "150+ kg", pro: "200+ kg" },
      }),
    ],
  },
  {
    slug: "cr_w1_lt1_row_squat",
    level: "world_class",
    phase: "base",
    name: "LT1 Row & Squat",
    why: "A kilometre and a half, a kilometre of rowing at LT1, thirty heavy squats. Aerobic power and raw strength in the same round.",
    station: "row",
    needs_erg: true,
    rounds: 4,
    lines: [
      run(1500, "Run"),
      work("Row at LT1", { distance_m: 1000 }),
      work("Back squats, heavy", { reps: 30 }),
    ],
  },
  {
    slug: "cr_w2_glycolytic_stress",
    level: "world_class",
    phase: "build",
    name: "Glycolytic Stress",
    why: "Pro weight on the sled, a transition under five seconds, then 3:45–3:55 per kilometre. Five times. Nothing about this is comfortable.",
    station: "sled_push",
    rounds: 5,
    lines: [
      work("Sled push at Pro weight", {
        distance_m: 50,
        load_by_division: { open: "202 kg", pro: "202 kg" },
      }),
      work("Transition — under 5 seconds"),
      run(1000, "Run at 3:45-3:55 min/km"),
    ],
  },
  {
    slug: "cr_w2_lunge_split_precision",
    level: "world_class",
    phase: "build",
    name: "Lunge & Split Precision",
    why: "A hundred metres of loaded lunges, then 3:50 per kilometre with under three seconds of split variance. The tolerance is the training stimulus.",
    station: "sandbag_lunges",
    rounds: 4,
    lines: [
      work("Sandbag lunges", { distance_m: 100, load_by_division: { open: "30 kg", pro: "30 kg" } }),
      run(1000, "Run at 3:50 min/km — split variance under 3 s"),
    ],
  },
  {
    slug: "cr_w2_ski_bbj_vo2",
    level: "world_class",
    phase: "build",
    name: "Ski, Jumps, VO₂max",
    why: "A sub-1:40 500 on the erg and thirty broad jumps before a VO₂max kilometre. Five rounds of it.",
    station: "burpee_broad_jump",
    needs_erg: true,
    rounds: 5,
    lines: [
      work("SkiErg — under 1:40 / 500 m", { distance_m: 500 }),
      work("Burpee broad jumps", { reps: 30 }),
      run(1000, "Run at VO₂max pace"),
    ],
  },
  {
    slug: "cr_w3_roxzone_precision",
    level: "world_class",
    phase: "peak",
    name: "Roxzone Precision",
    why: "Six kilometres under 3:50, each followed by a different station under competition conditions. This is the race, run in pieces.",
    needs_erg: true,
    rounds: 1,
    lines: [
      work("Six efforts, a different station after each — race order, race conditions"),
      run(1000, "Run at sub-3:50 min/km"),
      work("Station after each run: Ski, Sled Push, Sled Pull, Row, Lunges, Wall Balls"),
    ],
  },
  {
    slug: "cr_w3_lactate_buffer",
    level: "world_class",
    phase: "peak",
    name: "Lactate Buffer",
    why: "3:40 per kilometre, fifty wall balls unbroken, a hundred metres of heavy carry. Four rounds. The buffer is the point.",
    station: "wall_balls",
    rounds: 4,
    lines: [
      run(1000, "Run at 3:40 min/km"),
      work("Wall balls, unbroken", {
        reps: 50,
        load_by_division: { open: "6 kg", pro: "9 kg" },
      }),
      work("Farmers carry", { distance_m: 100, load_by_division: { open: "2×32 kg", pro: "2×32 kg" } }),
    ],
  },
  {
    slug: "cr_w3_dynamic_integration",
    level: "world_class",
    phase: "peak",
    name: "Full Dynamic Integration",
    why: "Eight 600s at 3:30 with a rotating station and no rest worth the name. The hardest session in the catalogue.",
    station: "sled_pull",
    needs_erg: true,
    rounds: 1,
    lines: [
      work("Eight efforts, station rotates, rest minimised to zero"),
      run(600, "Run at 3:30 min/km"),
      work("Sled drag (rounds 1, 4, 7)", {
        distance_m: 30,
        load_by_division: { open: "103 kg", pro: "153 kg" },
      }),
      work("Burpee broad jumps (rounds 2, 5, 8)", { reps: 15 }),
      work("SkiErg (rounds 3, 6)", { distance_m: 250 }),
    ],
  },
  {
    slug: "cr_w4_cadence_focus",
    level: "world_class",
    phase: "taper",
    name: "Cadence & Breathing",
    why: "Three rounds at 3:45 with a short row and ten wall balls. The focus is cadence and breathing, not effort.",
    station: "row",
    needs_erg: true,
    rounds: 3,
    lines: [
      run(600, "Run at race pace, 3:45 min/km — cadence and breathing"),
      work("Row", { distance_m: 250 }),
      work("Wall balls", { reps: 10, load_by_division: { open: "6 kg", pro: "9 kg" } }),
    ],
  },
  {
    slug: "cr_w4_short_sharp_stimuli",
    level: "world_class",
    phase: "taper",
    name: "Short Sharp Stimuli",
    why: "Two rounds, half the volume, all of the intent. Race week is for keeping the edge, not making one.",
    station: "sled_push",
    rounds: 2,
    lines: [
      run(800, "Run at race pace"),
      work("Sled push, short", {
        distance_m: 20,
        load_by_division: { open: "202 kg", pro: "202 kg" },
      }),
      work("Carry", { distance_m: 100, load_by_division: { open: "2×32 kg", pro: "2×32 kg" } }),
    ],
  },
  {
    slug: "cr_w4_cns_activation",
    level: "world_class",
    phase: "taper",
    name: "CNS Activation",
    why: "Three 400s at competition tempo with five dynamic jumps each. Wake the system, spend nothing.",
    station: "burpee_broad_jump",
    rounds: 1,
    lines: [
      work("Three efforts, full recovery between"),
      run(400, "Run at competition tempo"),
      work("Dynamic box or broad jumps", { reps: 5 }),
    ],
  },
];

// ── Choosing one ────────────────────────────────────────────────────────────

export interface CompromisedQuery {
  level: ExperienceLevel;
  phase: PhaseType;
  weekNumber: number;
  equipment: EquipmentAccess;
  stationTiers: StationTiers;
  weaknesses?: string[];
}

export interface CompromisedPick {
  session: CompromisedSession;
  /** Chosen to attack a stated or measured weakness, not by rotation. */
  targeted: boolean;
  /** How many sessions this level and phase had to choose from. */
  pool: number;
}

function hasErg(equipment: EquipmentAccess): boolean {
  return equipment !== "home_minimal";
}

/** The station the athlete is weakest at, or null when nothing stands out. */
function weakestStation(tiers: StationTiers): Station | null {
  let worst: Station | null = null;
  let lowest = Infinity;
  for (const [station, tier] of Object.entries(tiers)) {
    if (tier < lowest) {
      lowest = tier;
      worst = station as Station;
    }
  }
  return lowest < 3 ? worst : null;
}

/**
 * One compromised session for this athlete, this phase, this week.
 *
 * Same rotation rule as the other catalogues: every second week goes after the
 * weakest station, and the weeks in between deliberately exclude it — a
 * "weakness focus" that fires every week is just the same session every week.
 *
 * Falls back down the levels when a level and phase has nothing left after the
 * equipment filter: a home-gym athlete without an erg still gets compromised
 * running, just not the version that needs a SkiErg.
 */
export function pickCompromisedSession(q: CompromisedQuery): CompromisedPick | null {
  const byLevel = COMPROMISED_SESSIONS.filter(
    (s) => s.level === q.level && s.phase === q.phase,
  );
  let eligible = byLevel.filter((s) => !s.needs_erg || hasErg(q.equipment));
  if (!eligible.length) {
    // Nothing at this level survives the equipment filter — take the same
    // phase from any level rather than dropping compromised running entirely.
    eligible = COMPROMISED_SESSIONS.filter(
      (s) => s.phase === q.phase && (!s.needs_erg || hasErg(q.equipment)),
    );
  }
  if (!eligible.length) return null;

  const weak = weakestStation(q.stationTiers);
  const words = (q.weaknesses ?? []).map((w) => w.toLowerCase());
  const targeted = eligible.filter(
    (s) =>
      (weak && s.station === weak) ||
      (s.station != null && words.some((w) => w.includes(s.station!.replace(/_/g, " ")))),
  );

  if (targeted.length && q.weekNumber % 2 === 1) {
    return {
      session: targeted[Math.floor((q.weekNumber - 1) / 2) % targeted.length],
      targeted: true,
      pool: eligible.length,
    };
  }
  const rest = targeted.length ? eligible.filter((s) => !targeted.includes(s)) : eligible;
  const pool = rest.length ? rest : eligible;
  return {
    session: pool[(q.weekNumber - 1) % pool.length],
    targeted: false,
    pool: eligible.length,
  };
}

/** Running metres in one session — erg and carry distances are not mileage. */
export function runningMetres(session: CompromisedSession): number {
  const perRound = session.lines.reduce((n, l) => n + (l.is_run ? (l.distance_m ?? 0) : 0), 0);
  return perRound * session.rounds;
}

/**
 * The session as lines to draw, round count included. One place builds it, so
 * the prose and the number can never disagree.
 */
export function renderCompromised(session: CompromisedSession): SessionLine[] {
  if (session.rounds <= 1) return session.lines;
  const rest = session.rest_between_rounds_sec;
  return [
    {
      exercise: `${session.rounds} rounds${rest ? ` — ${Math.round(rest / 60)} min between rounds` : ""}`,
      ...(rest ? { rest_sec: rest } : {}),
    },
    ...session.lines,
  ];
}
