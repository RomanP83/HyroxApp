// ============================================================================
// Variants of the Hyrox station session.
//
// The station work of a base block and the station work of a race week are not
// the same session with a different weight on the sled: one builds absolute
// force and capacity, the other primes the nervous system without leaving a
// mark. This catalogue holds the shapes, phase by phase; the shared picker in
// runVariants.ts decides which one a given week gets (rotation, with every
// second week aimed at the athlete's weakest station).
//
// Loads are written against the competition weights the library uses:
//   sled push 125 / 175 kg · sled pull 78 / 128 kg · farmers 2×24 / 2×32 kg
//   sandbag lunges 20 / 30 kg · wall balls 6 / 9 kg   (open / pro)
// ============================================================================

import { pickVariant, type SessionVariant, type VariantPick, type VariantQuery } from "./runVariants";

export type StationVariant = SessionVariant & { session_type: "station_work" };

export const STATION_VARIANTS: StationVariant[] = [
  // ── 1. Base: overload, maximal strength, base capacity ────────────────
  {
    slug: "sv_overload_sled_grip",
    session_type: "station_work",
    name: "Overload Sled & Grip Builder",
    phases: ["base"],
    station: "sled_push",
    keywords: ["sled", "schlitten", "push", "grip", "griff", "farmer", "carry"],
    why: "Sled at 125% of race weight into a heavy carry — absolute force transfer and forearm stability, built where there is time to build it.",
  },
  {
    slug: "sv_aerobic_erg_capacity",
    session_type: "station_work",
    name: "Aerobic Ergometer Capacity",
    phases: ["base"],
    needs_erg: true,
    station: "ski_erg",
    keywords: ["ski", "row", "rudern", "erg", "technik", "technique", "aerob", "aerobic"],
    why: "Forty unbroken minutes alternating SkiErg and RowErg in Z2/low Z3 — pulling technique becomes economical and the upper body learns to clear lactate.",
  },
  {
    slug: "sv_wallball_lunge_volume",
    session_type: "station_work",
    name: "Wall Ball & Lunge Volume",
    phases: ["base"],
    station: "wall_balls",
    keywords: ["wall", "ball", "lunge", "ausfall", "quad", "schulter", "shoulder"],
    why: "Unbroken wall balls into front-rack lunges — quad and shoulder hypertrophy, and the deep squat mechanics everything else depends on.",
  },

  // ── 2. Build: strength endurance, cadence, lactate tolerance ──────────
  {
    slug: "sv_erg_threshold",
    session_type: "station_work",
    name: "Ergometer Threshold Intervals",
    phases: ["build"],
    needs_erg: true,
    station: "row",
    keywords: ["ski", "row", "rudern", "erg", "schwelle", "threshold", "laktat", "lactate"],
    why: "5 × 1000 m at race pace minus 3-5 s with short rest — the anaerobic threshold moves, and the stroke stays economical at high rate.",
  },
  {
    slug: "sv_density_emom",
    session_type: "station_work",
    name: "Station Density EMOM",
    phases: ["build"],
    station: "general",
    keywords: ["dichte", "density", "erholung", "recovery", "kapazität", "capacity"],
    why: "Thirty minutes on the minute across four stations — density, and the ability to recover while the clock keeps running.",
  },
  {
    slug: "sv_push_pull_circuit",
    session_type: "station_work",
    name: "Heavy Leg Push-Pull Circuit",
    phases: ["build"],
    station: "sled_pull",
    keywords: ["sled", "schlitten", "pull", "push", "bein", "leg", "quad", "laktat", "lactate"],
    why: "Sled push straight into sled pull straight into thrusters — maximal lactate in the thighs, and getting used to the burn instead of fearing it.",
  },

  // ── 3. Specificity: race pace, transitions, rhythm ────────────────────
  {
    slug: "sv_engine_gauntlet",
    session_type: "station_work",
    name: "The Engine & Core Gauntlet",
    phases: ["peak"],
    needs_erg: true,
    station: "general",
    keywords: ["pacing", "split", "wettkampf", "race", "simulation"],
    why: "Every station of the race, back to back and for time, with no running in between — the full competition load at your planned split.",
  },
  {
    slug: "sv_station_intervals_3x3",
    session_type: "station_work",
    name: "Station Interval Simulation (3×3)",
    phases: ["peak"],
    needs_erg: true,
    station: "general",
    keywords: ["übergang", "transition", "cue", "rhythmus", "rhythm"],
    why: "Three rounds of five stations at real race heart rate — the cues (breathing, stride, hand changes) become automatic.",
  },
  {
    slug: "sv_race_finish_finisher",
    session_type: "station_work",
    name: "Wall Ball & Lunge Race Finish",
    phases: ["peak"],
    station: "wall_balls",
    keywords: ["wall", "ball", "lunge", "ausfall", "finish", "mental"],
    why: "The last two stations of a Hyrox, four times, on exactly 60 s rest — mental hardness and clean movement when it hurts most.",
  },

  // ── 4. Taper & race week: reactivity, freshness, precision ────────────
  {
    slug: "sv_neural_priming",
    session_type: "station_work",
    name: "Neural Activation & Pacing Calibration",
    phases: ["taper"],
    needs_erg: true,
    station: "general",
    why: "Short, sharp touches of four stations at exact race pace — the nervous system is primed, nothing is emptied.",
  },
  {
    slug: "sv_movement_primer",
    session_type: "station_work",
    name: "Ergometer & Movement Primer",
    phases: ["taper"],
    needs_erg: true,
    station: "row",
    why: "Easy Z1 work with a few race-pace touches and mobility for shoulders and hip flexors — the day-before session that leaves you fresher than it found you.",
  },
];

/** The station catalogue, through the shared picker. */
export function pickStationVariant(opts: VariantQuery): VariantPick<StationVariant> | null {
  return pickVariant(STATION_VARIANTS, opts);
}
