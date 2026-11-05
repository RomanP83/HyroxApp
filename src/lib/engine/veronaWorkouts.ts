// ============================================================================
// The Verona collection — the sessions of the single-file Verona plan
// (HyroxTraining), as a workout collection the engine can plan with.
//
// With athlete_profiles.workout_collection = 'verona', fill.ts asks this
// catalogue first for every slot: if it has a session for that session type
// and phase, that is the session; if not, the library decides as before. The
// engine still owns the week — how many sessions, which days, how long, how
// hard, deloads, taper and every adaptation. The collection only supplies the
// content, the way the original plan wrote it.
//
// What was translated, not copied:
//   - Paces are relative to the athlete's live zones ("threshold", "race pace
//     −10 s/km") instead of the original fixed 4:00/km, so they follow the
//     calibration like every other session.
//   - Loads use the library's competition weights per division.
//   - Phases map foundation → base, endurance → build, specific and race →
//     peak, taper → taper. The original's recovery and holiday weeks have no
//     counterpart; the engine's own deload and rehab logic covers them.
//   - Situational sessions (the calf-friendly day) only appear when the
//     profile names that weakness, as the original only used them then.
// ============================================================================

import type { SessionLine } from "./compromisedSessions";
import { pickVariant, type SessionVariant, type VariantPick, type VariantQuery } from "./runVariants";
import type { SessionType } from "./types";

export type WorkoutCollection = "standard" | "verona";
export const WORKOUT_COLLECTIONS: WorkoutCollection[] = ["standard", "verona"];

export interface CollectionWorkout extends SessionVariant {
  /** The session's name in the original plan, so it is recognisable. */
  original: string;
  /** How many times through `lines`; 1 = straight through. */
  rounds?: number;
  rest_between_rounds_sec?: number;
  /** Only offered when a stated weakness matches its keywords. */
  situational?: boolean;
  lines: SessionLine[];
}

// Competition weights, the same as the library's (stationVariants.ts header).
const PUSH = { open: "125 kg", pro: "175 kg" };
const PUSH_HEAVY = { open: "150-160 kg", pro: "210-225 kg" };
const PULL = { open: "78 kg", pro: "128 kg" };
const PULL_HEAVY = { open: "95-100 kg", pro: "155-165 kg" };
const FARMERS = { open: "2 × 24 kg", pro: "2 × 32 kg" };
const FARMERS_HEAVY = { open: "2 × 32 kg", pro: "2 × 40 kg" };
const SANDBAG = { open: "20 kg", pro: "30 kg" };
const SANDBAG_HEAVY = { open: "30 kg", pro: "40 kg" };
const WALLBALL = { open: "6 kg / 3.0 m", pro: "9 kg / 3.0 m" };

const PULL_CUE = "Sled pull: take the rope tight before every pull, and stay behind the line like in the race.";

const run = (distance_m: number, exercise: string, extra: Partial<SessionLine> = {}): SessionLine => ({
  exercise,
  distance_m,
  is_run: true,
  ...extra,
});
const work = (exercise: string, extra: Partial<SessionLine> = {}): SessionLine => ({ exercise, ...extra });

export const VERONA_WORKOUTS: CollectionWorkout[] = [
  // ══ Quality runs (run_intervals) ═════════════════════════════════════════
  {
    slug: "vr_threshold_6min",
    original: "Quality Run · 4-6 × 6 Min. @ Schwelle",
    session_type: "run_intervals",
    name: "Threshold 6-Minute Reps",
    phases: ["base"],
    keywords: ["schwelle", "threshold", "lauf", "running"],
    why: "Raises your threshold. The higher it sits, the easier eight kilometres at race pace feel.",
    lines: [
      work("Warm-up jog, 15 min"),
      work("4-6 × 6 min at threshold pace (±3 s/km), RPE 7, 2 min jog between — 4 reps in week 1, one more every other week up to 6", { rest_sec: 120 }),
      work("Cool-down jog, 10 min"),
      work("The last rep should feel like the first."),
    ],
  },
  {
    slug: "vr_threshold_10min",
    original: "Quality Run · 3 × 10 Min. @ Schwelle",
    session_type: "run_intervals",
    name: "Threshold 3 × 10 min",
    phases: ["build"],
    keywords: ["schwelle", "threshold"],
    why: "Longer threshold blocks: you hold the brisk pace for longer without tipping over.",
    lines: [
      work("Warm-up jog, 15 min"),
      work("10 min at threshold pace (±3 s/km), RPE 7", { sets: 3, rest_sec: 120 }),
      work("Cool-down jog, 10 min"),
    ],
  },
  {
    slug: "vr_threshold_15min",
    original: "Quality Run · 2 × 15 Min. @ Schwelle",
    session_type: "run_intervals",
    name: "Threshold 2 × 15 min",
    phases: ["build"],
    keywords: ["schwelle", "threshold"],
    why: "Thirty minutes at threshold — the base for eight kilometres at race pace under fatigue.",
    lines: [
      work("Warm-up jog, 15 min"),
      work("15 min at threshold pace (±3 s/km), RPE 7", { sets: 2, rest_sec: 180 }),
      work("Cool-down jog, 10 min"),
    ],
  },
  {
    slug: "vr_tempo_hyrox",
    original: "Tempo-HYROX · 25 Min. Tempo + 2 Runden",
    session_type: "run_intervals",
    name: "Tempo HYROX",
    phases: ["build"],
    station: "sled_pull",
    keywords: ["tempo", "compromised", "pull", "wall"],
    why: "A threshold stimulus plus running straight off a station, without loading the legs like a game day.",
    lines: [
      work("Warm-up jog, 15 min"),
      work("25 min at tempo pace, then 5 min walk"),
      work("Round 1 at tempo: 400 m · sled pull 25 m · 400 m · 20 wall balls", { load_by_division: PULL }),
      work("Round 2 at tempo: 400 m · SkiErg 250 m · 400 m · 20 wall balls", { load_by_division: WALLBALL }),
      run(400, "Finish: 400 m — every 400 after a station as fast as the one before"),
      work(PULL_CUE),
    ],
  },
  {
    slug: "vr_1k_repeats_wb",
    original: "Quality Run · 6-8 × 1 km + WB 4 min EMOM",
    session_type: "run_intervals",
    name: "1 km Repeats + Wall Ball EMOM",
    phases: ["peak"],
    station: "wall_balls",
    keywords: ["1 km", "1k", "tempo", "speed", "wall"],
    why: "One kilometre is your race unit. Trained a little faster than race pace, race pace feels calmer on the day.",
    lines: [
      work("Warm-up jog, 15 min"),
      run(1000, "At race pace −10 to −5 s/km, 1 min standing rest (8 reps in the later weeks)", { sets: 6, rest_sec: 60 }),
      work("Straight after: wall balls EMOM, 4 min", { reps: 20, load_by_division: WALLBALL }),
      work("Cool-down jog, 10 min"),
    ],
  },
  {
    slug: "vr_tempo_hyrox_3",
    original: "Tempo-HYROX · 30 Min. Tempo + 3 Runden",
    session_type: "run_intervals",
    name: "Tempo HYROX, Three Rounds",
    phases: ["peak"],
    station: "wall_balls",
    keywords: ["tempo", "compromised", "wall"],
    why: "A longer tempo block and one more round: holding pace while stations and wall balls pile up.",
    lines: [
      work("Warm-up jog, 15 min"),
      work("30 min at tempo pace, then 5 min walk"),
      work("3 rounds at tempo: 400 m · station (sled pull 25 m / SkiErg 250 m / row 250 m) · 400 m · 20 wall balls", {
        sets: 3,
        load_by_division: WALLBALL,
      }),
      run(400, "Finish: 400 m"),
      work(PULL_CUE),
    ],
  },
  {
    slug: "vr_tempo_hyrox_short",
    original: "Tempo-HYROX · 20 Min. Tempo + 2 Runden",
    session_type: "run_intervals",
    name: "Tempo HYROX, Short",
    phases: ["peak"],
    keywords: ["tempo"],
    why: "The short version for the race block: tempo stays sharp, volume comes down.",
    lines: [
      work("Warm-up jog, 15 min"),
      work("20 min at tempo pace, then 5 min walk"),
      work("2 rounds at tempo: 400 m · sled pull 25 m / SkiErg 250 m · 400 m · 20 wall balls", {
        sets: 2,
        load_by_division: WALLBALL,
      }),
      run(400, "Finish: 400 m"),
    ],
  },
  {
    slug: "vr_1k_short_wb",
    original: "Quality Run · 5 × 1 km + WB 4 min EMOM",
    session_type: "run_intervals",
    name: "5 × 1 km, Kept Short",
    phases: ["peak"],
    keywords: ["1 km", "1k"],
    why: "Keeps the pace sharp without costing recovery — the session for the week after a simulation.",
    lines: [
      work("Warm-up jog, 15 min"),
      run(1000, "At race pace −5 to 0 s/km, 90 s rest", { sets: 5, rest_sec: 90 }),
      work("Wall balls EMOM, 4 min", { reps: 20, load_by_division: WALLBALL }),
      work("Cool-down jog"),
    ],
  },
  {
    slug: "vr_taper_400s",
    original: "Quality Run · 6 × 400 m (Taper)",
    session_type: "run_intervals",
    name: "Taper 400s",
    phases: ["taper"],
    why: "Short, quick touches: the legs stay springy without any fatigue before the race.",
    lines: [
      work("Warm-up jog, 15 min"),
      run(400, "At race pace −10 s/km, 200 m jog between", { sets: 6 }),
      work("Easy cool-down jog"),
    ],
  },

  // ══ Long runs ═════════════════════════════════════════════════════════════
  {
    slug: "vr_long_easy",
    original: "Long Easy Run · 60-90 Min Zone 2",
    session_type: "long_run",
    name: "Long Easy Run",
    phases: ["base", "build", "peak"],
    why: "The aerobic engine everything else runs on — steady, conversational, never a race.",
    lines: [work("60-90 min continuous in Zone 2 — easy start, no fast finish")],
  },
  {
    slug: "vr_long_wallballs",
    original: "Long Run · 60-80 Min Zone 2 + 100 Wall Balls",
    session_type: "long_run",
    name: "Long Run + 100 Wall Balls",
    phases: ["peak"],
    station: "wall_balls",
    keywords: ["wall", "ball", "wb"],
    why: "In the race the wall balls come after eight kilometres of running. This trains your biggest gap on tired legs instead of fresh ones.",
    lines: [
      work("60-80 min easy in Zone 2"),
      work("Straight after, no rest to recover: 100 wall balls in your test split 25/25/20/15/15", {
        reps: 100,
        load_by_division: WALLBALL,
      }),
    ],
  },
  {
    slug: "vr_long_race_finish",
    original: "Long Run · 70-80 Min mit Renntempo-Finish",
    session_type: "long_run",
    name: "Long Run, Race-Pace Finish",
    phases: ["peak"],
    keywords: ["fade", "second half", "zweite"],
    why: "Race pace on legs that are already tired — the second half of the race.",
    lines: [
      work("70-80 min easy in Zone 2"),
      work("The last 10-15 min at race pace — controlled fast, not all-out"),
    ],
  },

  // ══ Easy runs ═════════════════════════════════════════════════════════════
  {
    slug: "vr_easy_wb_emom",
    original: "Easy Run · 45-60 Min Zone 2 + WB 10 × 10 EMOM",
    session_type: "run_easy",
    name: "Easy Run + Wall Ball EMOM",
    phases: ["base", "build", "peak"],
    station: "wall_balls",
    keywords: ["wall", "ball", "wb"],
    why: "Aerobic volume, with a wall-ball habit stitched on: ten clean reps every minute.",
    lines: [
      work("45-60 min in Zone 2"),
      work("Wall balls EMOM, 10 min", { sets: 10, reps: 10, load_by_division: WALLBALL }),
    ],
  },
  {
    slug: "vr_easy_pm",
    original: "PM Easy Run · 30-40 Min Zone 2",
    session_type: "run_easy",
    name: "Easy Zone 2 Run",
    phases: ["base", "build", "peak", "taper"],
    why: "Easy kilometres that cost nothing tomorrow.",
    lines: [work("30-40 min in Zone 2 — a conversation the whole way")],
  },

  // ══ Strength ══════════════════════════════════════════════════════════════
  {
    slug: "vr_strength_a",
    original: "Strength A · Unterkörper / Power",
    session_type: "strength",
    name: "Strength A · Lower Body & Power",
    phases: ["base", "build", "peak"],
    keywords: ["bein", "leg", "squat", "kraft", "power", "wade", "calf"],
    why: "Maximal strength and controlled force transfer for the sled, the lunges and the runs.",
    lines: [
      work("Warm up easily and mobilise"),
      work("Power: pogo jumps, broad jumps — fresh, before anything heavy"),
      work("Maximal strength: back squat"),
      work("Single leg and posterior chain: Bulgarian split squat, RDL, leg curl"),
      work("Calf, soleus and core: calf raise, soleus raise, ab wheel, Pallof press"),
      work("Sets and loads: your own programme on the Strength page. Calf or Achilles irritated? Do not progress the jumps today."),
    ],
  },
  {
    slug: "vr_strength_b",
    original: "Strength B · Oberkörper / Zug & Druck",
    session_type: "strength",
    name: "Strength B · Upper Body Pull & Push",
    phases: ["base", "build", "peak"],
    keywords: ["oberkörper", "upper", "pull", "zug", "grip", "griff", "ski"],
    why: "Pulling and grip strength for the SkiErg, the sled pull and the carry; stable shoulders for wall balls and burpees. Barely loads the legs.",
    lines: [
      work("Warm-up on SkiErg or rower, plyometric push-ups"),
      work("Pull: lat pulldown or pull-up, cable row"),
      work("Push: incline Smith press, DB shoulder press"),
      work("Carry & assistance: heavy farmers carry, face pull, straight-arm pulldown", { load_by_division: FARMERS_HEAVY }),
      work("Sets and loads: your own programme on the Strength page."),
    ],
  },
  {
    slug: "vr_strength_a_light",
    original: "Strength A · leicht / kurz",
    session_type: "strength",
    name: "Strength A · Light & Short",
    phases: ["taper"],
    why: "Keeps the pattern and the snap; nothing is emptied in race week.",
    lines: [
      work("Pogo jumps and broad jumps, a few crisp sets"),
      work("Back squat and RDL at moderate load, low volume — leave plenty in the tank"),
    ],
  },

  // ══ Station work ══════════════════════════════════════════════════════════
  {
    slug: "vr_sv_heavy_sled",
    original: "HYROX-Stationen · Kraft · Sled schwer",
    session_type: "station_work",
    name: "Heavy Sled & Carry",
    phases: ["base"],
    station: "sled_push",
    keywords: ["sled", "schlitten", "push", "pull", "grip", "griff"],
    why: "Maximal strength for the sled and the grip, so race weight feels lighter later.",
    lines: [
      work("Warm-up, 10 min"),
      work("Sled push, 20-30 % over race weight, 2-3 min rest", { sets: 6, distance_m: 10, load_by_division: PUSH_HEAVY }),
      work("Sled pull, 20-30 % over race weight, 2-3 min rest", { sets: 6, distance_m: 10, load_by_division: PULL_HEAVY }),
      work("Farmers carry, heavy", { sets: 4, distance_m: 40, load_by_division: FARMERS_HEAVY }),
      work("Wall balls EMOM, 5 min", { sets: 5, load_by_division: WALLBALL }),
      work("SkiErg and row, each 4 × 250 m at target pace", { sets: 4, distance_m: 250 }),
      work(PULL_CUE),
    ],
  },
  {
    slug: "vr_sv_heavy_legs",
    original: "HYROX-Stationen · Kraft · Lunges & Carry schwer",
    session_type: "station_work",
    name: "Heavy Lunges & Carry",
    phases: ["base"],
    station: "sandbag_lunges",
    keywords: ["lunge", "ausfall", "carry", "farmer", "bein", "leg"],
    why: "Strength in legs, trunk and grip for the lunges and the carry.",
    lines: [
      work("Warm-up, 10 min"),
      work("Sandbag lunges, heavy, 2 min rest", { sets: 4, distance_m: 20, load_by_division: SANDBAG_HEAVY }),
      work("Farmers carry, heavy, 2 min rest", { sets: 4, distance_m: 50, load_by_division: FARMERS_HEAVY }),
      work("Sled push at race weight, clean technique", { sets: 4, distance_m: 12.5, load_by_division: PUSH }),
      work("Wall balls EMOM, 5 min", { sets: 5, load_by_division: WALLBALL }),
      work("SkiErg and row, each 4 × 250 m at target pace", { sets: 4, distance_m: 250 }),
    ],
  },
  {
    slug: "vr_sv_sled_25",
    original: "HYROX-Stationen · Kraftausdauer · Sled 25 m",
    session_type: "station_work",
    name: "Sled 25 m Strength Endurance",
    phases: ["build"],
    station: "sled_pull",
    keywords: ["sled", "schlitten", "pull", "push"],
    why: "Longer sled distances at race weight: strength becomes strength endurance.",
    lines: [
      work("Warm-up, 10 min"),
      work("Sled push at race weight, 90 s rest", { sets: 4, distance_m: 25, load_by_division: PUSH }),
      work("Sled pull at race weight, 90 s rest", { sets: 4, distance_m: 25, load_by_division: PULL }),
      work("Wall balls EMOM, 5 min", { sets: 5, load_by_division: WALLBALL }),
      work("SkiErg and row, each 2 × 500 m at target pace, 2 min rest", { sets: 2, distance_m: 500 }),
      work(PULL_CUE),
    ],
  },
  {
    slug: "vr_sv_legs_unbroken",
    original: "HYROX-Stationen · Kraftausdauer · Lunges & Carry am Stück",
    session_type: "station_work",
    name: "Lunges & Carry Unbroken",
    phases: ["build"],
    station: "sandbag_lunges",
    keywords: ["lunge", "ausfall", "carry", "farmer"],
    why: "Lunges and carry at full race distance without putting anything down.",
    lines: [
      work("Warm-up, 10 min"),
      work("Sandbag lunges, unbroken, then 3 min rest", { distance_m: 100, load_by_division: SANDBAG }),
      work("Farmers carry, 2 min rest", { sets: 2, distance_m: 200, load_by_division: FARMERS }),
      work("Sled push at race weight", { sets: 3, distance_m: 25, load_by_division: PUSH }),
      work("Wall balls EMOM, 5 min", { sets: 5, load_by_division: WALLBALL }),
      work("SkiErg and row, each 2 × 500 m", { sets: 2, distance_m: 500 }),
    ],
  },
  {
    slug: "vr_sv_sled_50_run",
    original: "HYROX-Stationen · Kraftausdauer · Sled 50 m + Lauf",
    session_type: "station_work",
    name: "Sled 50 m with Runs",
    phases: ["build"],
    station: "sled_pull",
    keywords: ["sled", "schlitten", "pull", "push"],
    why: "The full sled race distance with running in between — the sled pull was the second-biggest gap.",
    rounds: 2,
    rest_between_rounds_sec: 180,
    lines: [
      work("Sled push at race weight", { distance_m: 50, load_by_division: PUSH }),
      run(400, "Run at target pace"),
      work("Sled pull at race weight", { distance_m: 50, load_by_division: PULL }),
      run(400, "Run at target pace"),
      work("After both rounds: wall balls EMOM 5 min, SkiErg 2 × 500 m at target pace", { load_by_division: WALLBALL }),
      work(PULL_CUE),
    ],
  },
  {
    slug: "vr_sv_run_sled_circuit",
    original: "HYROX-Stationen · Unter Ermüdung · Lauf + Sled",
    session_type: "station_work",
    name: "Run + Sled Circuit",
    phases: ["peak"],
    station: "sled_push",
    keywords: ["sled", "schlitten", "push", "pull", "transition"],
    why: "The sled under running fatigue, and the run straight after it — like the race.",
    rounds: 4,
    lines: [
      run(500, "At target pace — circuit, no rest"),
      work("Sled push at race weight", { distance_m: 25, load_by_division: PUSH }),
      work("Sled pull at race weight", { distance_m: 25, load_by_division: PULL }),
      work("After the circuit: 3 min rest, SkiErg 2 × 500 m at target pace, wall balls EMOM 5 min", { load_by_division: WALLBALL }),
      work(PULL_CUE),
    ],
  },
  {
    slug: "vr_sv_run_carry_lunges",
    original: "HYROX-Stationen · Unter Ermüdung · Lauf + Carry & Lunges",
    session_type: "station_work",
    name: "Run + Carry & Lunges Circuit",
    phases: ["peak"],
    station: "sandbag_lunges",
    keywords: ["lunge", "ausfall", "carry", "farmer", "second half", "zweite"],
    why: "Carry and lunges on tired legs, then running again — exactly the order of the second half of the race.",
    rounds: 4,
    lines: [
      run(500, "At target pace — circuit, no rest"),
      work("Farmers carry", { distance_m: 50, load_by_division: FARMERS }),
      work("Sandbag lunges", { distance_m: 25, load_by_division: SANDBAG }),
      work("After the circuit: 3 min rest, row 2 × 500 m at target pace, wall balls EMOM 5 min", { load_by_division: WALLBALL }),
    ],
  },
  {
    slug: "vr_sv_race_ski_push_pull",
    original: "HYROX-Stationen · Renntempo · Ski, Push, Pull",
    session_type: "station_work",
    name: "Race Pace: Ski, Push, Pull",
    phases: ["peak"],
    needs_erg: true,
    station: "ski_erg",
    keywords: ["ski", "sled", "push", "pull", "split", "test"],
    why: "Shows whether your target splits for the SkiErg and the sled are realistic.",
    lines: [
      work("Warm-up, 15 min"),
      work("SkiErg at target split, then 4 min rest", { distance_m: 1000 }),
      work("Sled push at race weight, target split, 4 min rest", { distance_m: 50, load_by_division: PUSH }),
      work("Sled pull at race weight, target split", { distance_m: 50, load_by_division: PULL }),
      work("Wall balls EMOM, 5 min", { sets: 5, load_by_division: WALLBALL }),
      work("Time every station against your target — enter them as station benchmarks if you like."),
      work(PULL_CUE),
    ],
  },
  {
    slug: "vr_sv_race_row_carry_lunges_wb",
    original: "HYROX-Stationen · Renntempo · Row, Carry, Lunges + 100 WB",
    session_type: "station_work",
    name: "Race Pace: Row, Carry, Lunges + 100 WB",
    phases: ["peak"],
    needs_erg: true,
    station: "wall_balls",
    keywords: ["row", "carry", "lunge", "wall", "ball", "split", "test"],
    why: "The second-half stations at target split, finishing with the 100-wall-ball test.",
    lines: [
      work("Warm-up, 15 min"),
      work("Row at target split, 2 min rest", { distance_m: 1000 }),
      work("Farmers carry, 2 min rest", { distance_m: 200, load_by_division: FARMERS }),
      work("Sandbag lunges, 2 min rest", { distance_m: 100, load_by_division: SANDBAG }),
      work("Straight after: 100 wall balls in your test split", { reps: 100, load_by_division: WALLBALL }),
    ],
  },
  {
    slug: "vr_sv_taper",
    original: "HYROX-Stationen · Taper · kurz",
    session_type: "station_work",
    name: "Taper Stations",
    phases: ["taper"],
    why: "Keeps the movements fresh without any fatigue before the race.",
    lines: [
      work("Warm-up, 10 min"),
      work("Sled push and sled pull at race weight", { sets: 2, distance_m: 12.5, load_by_division: PUSH }),
      work("Wall balls", { sets: 2, reps: 15, load_by_division: WALLBALL }),
      work("SkiErg, easy-brisk", { sets: 2, distance_m: 250 }),
    ],
  },
  {
    slug: "vr_erg_sled",
    original: "Spieltag · Ergs + Sled ohne Laufen",
    session_type: "station_work",
    name: "Ergs + Sled, No Running",
    phases: ["build", "peak"],
    needs_erg: true,
    station: "sled_pull",
    keywords: ["wade", "calf", "achilles", "schonend", "low impact", "sled"],
    why: "Lots of work on ergs and sled with no running and no jumping — good after a simulation or when the legs are heavy.",
    rounds: 8,
    rest_between_rounds_sec: 60,
    lines: [
      work("SkiErg at target pace", { distance_m: 500 }),
      work("Sled push at race weight", { distance_m: 25, load_by_division: PUSH }),
      work("Row at target pace", { distance_m: 500 }),
      work("Sled pull at race weight", { distance_m: 25, load_by_division: PULL }),
      work(PULL_CUE),
    ],
  },
  {
    slug: "vr_ski_wb_bbj",
    original: "Spieltag · Ski + WB + BBJ · 10 Runden",
    session_type: "station_work",
    name: "Ski + Wall Balls + BBJ",
    phases: ["build"],
    needs_erg: true,
    station: "burpee_broad_jump",
    keywords: ["bbj", "burpee", "wall", "technik", "technique"],
    why: "A hundred burpee broad jumps and a hundred wall balls, with enough rest for clean technique.",
    rounds: 10,
    rest_between_rounds_sec: 120,
    lines: [
      work("SkiErg", { distance_m: 200 }),
      work("Wall balls", { reps: 10, load_by_division: WALLBALL }),
      work("SkiErg", { distance_m: 200 }),
      work("Burpee broad jumps (about 20 m)", { reps: 10 }),
    ],
  },
  {
    slug: "vr_bbj_emom",
    original: "Spieltag · BBJ-EMOM · 20 × 3 Min.",
    session_type: "station_work",
    name: "BBJ EMOM",
    phases: ["build"],
    needs_erg: true,
    station: "burpee_broad_jump",
    keywords: ["bbj", "burpee", "rhythm", "rhythmus"],
    why: "A fixed burpee-broad-jump rhythm with recovery built in, plus wall balls under fatigue.",
    rounds: 20,
    lines: [
      work("Minute 1: 10 burpee broad jumps (odd rounds) or 15 wall balls (even rounds)", { load_by_division: WALLBALL }),
      work("Minute 2: SkiErg 200 m at RPE 7"),
      work("Minute 3: bike, easy (RPE 5)"),
    ],
  },
  {
    slug: "vr_bbj_economy",
    original: "BBJ Economy + kurze HYROX-Technik",
    session_type: "station_work",
    name: "BBJ Economy",
    phases: ["base", "taper"],
    station: "burpee_broad_jump",
    keywords: ["bbj", "burpee", "technik", "technique", "economy"],
    why: "Movement economy: fewer stalls and less wasted energy, not maximum jump length.",
    lines: [
      work("Warm-up"),
      work("Burpee broad jumps — calm rhythm, controlled jumps, clean technique; recover between", { sets: 5, distance_m: 15, rest_sec: 90 }),
      work("Time each one and rate the technique (stable / changing / sloppy)."),
      work("Short HYROX technique block afterwards: transitions, wall-ball rhythm"),
    ],
  },
  {
    slug: "vr_bbj_capacity",
    original: "BBJ Capacity · Distanz- oder Zeitstufen",
    session_type: "station_work",
    name: "BBJ Capacity Ladder",
    phases: ["build"],
    station: "burpee_broad_jump",
    keywords: ["bbj", "burpee", "capacity", "kapazität"],
    why: "Tolerating burpee broad jumps for longer under control — without raising volume and speed at the same time.",
    lines: [
      work("Warm-up"),
      work("By distance: one stage per week — 4 × 20 m → 2 × 40 m → 80 m continuous, RPE 7-8"),
      work("or by time: 3 × 2 min → 2 × 3 min → 6 min continuous, 1 min rest, RPE 7-8"),
      work("Log time or metres, RPE and technique. Not an all-out test."),
    ],
  },

  // ══ Game days (compromised_run) ═══════════════════════════════════════════
  {
    slug: "vr_bbj_technique_erg",
    original: "Spieltag · BBJ-Technik + Lauf/Erg-Block",
    session_type: "compromised_run",
    name: "BBJ Technique + Run/Erg Block",
    phases: ["base"],
    needs_erg: true,
    station: "burpee_broad_jump",
    keywords: ["bbj", "burpee", "technik", "technique"],
    why: "Clean burpee broad jumps while fresh, then running and ergs at race pace — the base for the hard game days.",
    lines: [
      work("Race warm-up, 10 min"),
      work("Block A: burpee broad jumps, time each and rate the technique, 90 s rest", { sets: 6, distance_m: 15 }),
      work("Block B: 4 × (1 km at target pace · SkiErg 500 m · row 500 m), 1 min between rounds", { sets: 4 }),
      work("Cool-down, 5 min"),
    ],
  },
  {
    slug: "vr_ergs_burpees",
    original: "Spieltag · Ergs + Burpees",
    session_type: "compromised_run",
    name: "Ergs + Burpees",
    phases: ["base"],
    needs_erg: true,
    station: "ski_erg",
    keywords: ["ski", "row", "erg", "burpee"],
    why: "A lot of working time on the ergs, plus burpee technique with little jumping volume.",
    rounds: 3,
    lines: [
      work("SkiErg, close to target split", { distance_m: 1000 }),
      work("Burpee to plate", { reps: 20 }),
      work("Row, close to target split", { distance_m: 1000 }),
      work("Burpee broad jumps", { distance_m: 20 }),
      work("Bike, as active recovery", { distance_m: 2000 }),
      work("Push-ups", { reps: 20 }),
    ],
  },
  {
    slug: "vr_sled_to_run",
    original: "Spieltag · Sled → Run",
    session_type: "compromised_run",
    name: "Sled → Run",
    phases: ["build"],
    station: "sled_push",
    keywords: ["sled", "schlitten", "push", "transition", "übergang"],
    why: "The transition with the biggest pace loss in the race: heavy legs off the sled and straight back to running.",
    lines: [
      work("30 min run at RPE 6 as pre-fatigue"),
      work("5 rounds, no rest: 800 m at target pace (RPE 7), then sled push 25 m", { sets: 5, load_by_division: PUSH }),
      work("From round 2, start every run straight off the sled: first 200 m controlled, then back to target pace."),
      work("Cool-down, 5 min"),
    ],
  },
  {
    slug: "vr_pull_bbj",
    original: "Spieltag · Sled Pull + BBJ",
    session_type: "compromised_run",
    name: "Sled Pull + BBJ",
    phases: ["build"],
    station: "sled_pull",
    keywords: ["pull", "sled", "bbj", "burpee"],
    why: "Hits the sled pull and the burpee broad jumps with the run after them.",
    rounds: 6,
    lines: [
      run(500, "At target pace"),
      work("Sled pull at race weight", { distance_m: 25, load_by_division: PULL }),
      run(500, "At target pace"),
      work("Burpee broad jumps — bring the next run straight back to target pace", { distance_m: 40 }),
      work(PULL_CUE),
    ],
  },
  {
    slug: "vr_wb_endurance",
    original: "Spieltag · WB-Ausdauer · 6 × (800 m, 40 WB, BBJ 20 m)",
    session_type: "compromised_run",
    name: "Wall Ball Endurance",
    phases: ["build"],
    station: "wall_balls",
    keywords: ["wall", "ball", "wb"],
    why: "240 wall balls under running fatigue; burpee broad jumps instead of push-ups keep the shoulders fresh for the wall balls.",
    rounds: 6,
    lines: [
      run(800, "At target pace"),
      work("Wall balls in fixed blocks (20/20 or 15/15/10)", { reps: 40, load_by_division: WALLBALL }),
      work("Burpee broad jumps (about 10 reps)", { distance_m: 20 }),
      work("Skip the midweek wall-ball EMOM in this week."),
    ],
  },
  {
    slug: "vr_ski_bbj_80",
    original: "Spieltag · Ski + BBJ 80 m",
    session_type: "compromised_run",
    name: "Ski + BBJ 80 m",
    phases: ["peak"],
    needs_erg: true,
    station: "burpee_broad_jump",
    keywords: ["bbj", "burpee", "ski", "post-bbj", "pace loss"],
    why: "The full burpee-broad-jump race distance three times under fatigue, each with a run after it — shows your post-BBJ pace loss most clearly.",
    rounds: 3,
    lines: [
      run(800, "At target pace"),
      work("SkiErg", { distance_m: 1000 }),
      run(800, "At target pace"),
      work("Burpee broad jumps, unbroken", { distance_m: 80 }),
      work("The run off the jumps (next round): 200 m calm, 400 m strong, 200 m full."),
    ],
  },
  {
    slug: "vr_chipper",
    original: "Spieltag · Endurance Chipper",
    session_type: "compromised_run",
    name: "Endurance Chipper",
    phases: ["peak"],
    station: "sandbag_lunges",
    keywords: ["lunge", "sled", "bbj", "second half", "zweite"],
    why: "Leg-heavy stations close together, like the second half of the race; burpee broad jumps keep the jump economy in training.",
    lines: [
      work("Race warm-up, 15 min"),
      run(1000, "Block 1: at target pace"),
      work("Sled push 50 m · BBJ 40 m · sandbag lunges 100 m · BBJ 40 m", { load_by_division: PUSH }),
      run(1000, "Block 2: at target pace"),
      work("Sled push 25 m · BBJ 20 m · sandbag lunges 50 m · BBJ 20 m", { load_by_division: SANDBAG }),
      run(1000, "Block 3: at target pace"),
      work("Sled push 25 m · BBJ 20 m · sandbag lunges 50 m · BBJ 20 m"),
      work("Cool-down, 10 min"),
    ],
  },
  {
    slug: "vr_first_half",
    original: "Spieltag · Erste Rennhälfte",
    session_type: "compromised_run",
    name: "First Half of the Race",
    phases: ["peak"],
    needs_erg: true,
    station: "sled_pull",
    keywords: ["first half", "erste", "sled", "ski", "bbj", "simulation"],
    why: "Tests the stretch of the race with the biggest strength load. Time the stations and enter them as station benchmarks.",
    lines: [
      work("Race warm-up, 15 min"),
      run(1000, "At target pace"),
      work("SkiErg, full distance", { distance_m: 1000 }),
      run(1000, "At target pace"),
      work("Sled push, full distance", { distance_m: 50, load_by_division: PUSH }),
      run(1000, "At target pace"),
      work("Sled pull, full distance", { distance_m: 50, load_by_division: PULL }),
      run(1000, "At target pace"),
      work("Burpee broad jumps, full distance", { distance_m: 80 }),
      work("Then 2 km easy and 5 min mobility. " + PULL_CUE),
    ],
  },
  {
    slug: "vr_second_half",
    original: "Spieltag · Zweite Rennhälfte",
    session_type: "compromised_run",
    name: "Second Half of the Race",
    phases: ["peak"],
    needs_erg: true,
    station: "wall_balls",
    keywords: ["second half", "zweite", "wall", "lunge", "carry", "row"],
    why: "Wall balls and lunges under real pre-fatigue. Counts as the 100-wall-ball test.",
    lines: [
      work("Warm-up, 10 min; pre-fatigue: 2 km brisk + 500 m row"),
      run(1000, "At target pace"),
      work("Row, full distance", { distance_m: 1000 }),
      run(1000, "At target pace"),
      work("Farmers carry, full distance", { distance_m: 200, load_by_division: FARMERS }),
      run(1000, "At target pace"),
      work("Sandbag lunges, full distance", { distance_m: 100, load_by_division: SANDBAG }),
      run(1000, "At target pace"),
      work("100 wall balls in your test split", { reps: 100, load_by_division: WALLBALL }),
      work("Cool-down, 5 min"),
    ],
  },
  {
    slug: "vr_compromised_8x1k",
    original: "Spieltag · Compromised Running · 8 × (1 km + halbe Station)",
    session_type: "compromised_run",
    name: "Compromised Running 8 × 1 km",
    phases: ["peak"],
    needs_erg: true,
    station: "row",
    keywords: ["fade", "pace", "compromised", "run", "lauf"],
    why: "Finding race pace again straight after a station — against the pace loss in the second half.",
    rounds: 2,
    lines: [
      run(1000, "At target pace ±5 s"),
      work("Row", { distance_m: 500 }),
      run(1000, "At target pace ±5 s"),
      work("Wall balls", { reps: 50, load_by_division: WALLBALL }),
      run(1000, "At target pace ±5 s"),
      work("SkiErg", { distance_m: 500 }),
      run(1000, "At target pace ±5 s"),
      work("Sandbag lunges", { distance_m: 50, load_by_division: SANDBAG }),
      work("The goal: every kilometre the same speed."),
    ],
  },
  {
    slug: "vr_cutdown",
    original: "Spieltag · Cutdown Tempo · 7 × 1 km",
    session_type: "compromised_run",
    name: "Cutdown Tempo",
    phases: ["peak"],
    needs_erg: true,
    station: "sled_pull",
    keywords: ["cutdown", "pull", "sled", "run", "transition", "negative"],
    why: "Running, the sled pull and the pace straight off a station in one session — every kilometre faster than the one before, even off the sled.",
    lines: [
      work("Warm-up, 10 min"),
      work("7 × 1 km without rest, each faster: start 15-20 s/km slower than target pace, the last two faster than target pace"),
      work("After km 1-6, one station each at race weight, in turn: sled push 25 m · sled pull 25 m · row 500 m · push · pull · row", {
        load_by_division: PUSH,
      }),
      work("No station after km 7. Cool-down, 10 min. " + PULL_CUE),
    ],
  },
  {
    slug: "vr_400_sled_400",
    original: "Spieltag · 400 m / Sled / 400 m · 10 Runden",
    session_type: "compromised_run",
    name: "400 / Sled / 400",
    phases: ["peak"],
    station: "sled_push",
    keywords: ["sled", "push", "pull", "transition", "speed"],
    why: "Running straight off the sled, faster than race pace, with push and pull — the hardest sled-run combination in the plan.",
    rounds: 10,
    rest_between_rounds_sec: 60,
    lines: [
      run(400, "Faster than target pace"),
      work("2 min on the sled at race weight — push and pull in turn, count the metres", { load_by_division: PUSH }),
      run(400, "Faster than target pace — back on pace within the first 100 m"),
    ],
  },
  {
    slug: "vr_run_bbj",
    original: "Run → BBJ · 4 Runden",
    session_type: "compromised_run",
    name: "Run → BBJ",
    phases: ["peak"],
    station: "burpee_broad_jump",
    keywords: ["bbj", "burpee", "post-bbj"],
    why: "Burpee broad jumps done economically, and race pace found quickly on the run after them.",
    rounds: 4,
    lines: [
      run(1000, "At target pace"),
      work("Burpee broad jumps", { distance_m: 20 }),
      work("Time every run and every jump section; note the RPE."),
    ],
  },
  {
    slug: "vr_bbj_to_1k",
    original: "BBJ → 1 km · 200/600/200",
    session_type: "compromised_run",
    name: "BBJ → 1 km (200/600/200)",
    phases: ["peak"],
    station: "burpee_broad_jump",
    keywords: ["bbj", "burpee", "post-bbj", "pace loss"],
    why: "Back into pace straight off the jumps, and finishing a run strong on tired legs.",
    lines: [
      work("Warm-up"),
      work("Burpee broad jumps, unbroken", { distance_m: 80 }),
      run(1000, "Straight after: 200 m calm, 600 m strong and controlled, 200 m full — time the three parts"),
    ],
  },
  {
    slug: "vr_race_sequence",
    original: "Race Sequence · kontrolliert",
    session_type: "compromised_run",
    name: "Race Sequence, Controlled",
    phases: ["peak"],
    station: "burpee_broad_jump",
    keywords: ["sequence", "bbj", "simulation", "race"],
    why: "Holding performance across a long race sequence and making the cost of the burpee broad jumps visible.",
    lines: [
      work("Sled pull → run → BBJ → run → row → run → farmers → run → lunges, in race order", { load_by_division: PULL }),
      work("Start with reduced volume; note the pace before and after the jumps and the later stations."),
    ],
  },
  {
    slug: "vr_late_race",
    original: "Late-Race Fatigue · dosiert",
    session_type: "compromised_run",
    name: "Late-Race Fatigue",
    phases: ["peak"],
    station: "wall_balls",
    keywords: ["late", "spät", "fade", "wall", "lunge"],
    why: "Lunges, the last runs and the wall balls under pre-fatigue — controlled, not a weekly maximum.",
    lines: [
      work("BBJ → run → row / farmers → run → lunges → run → wall balls, in race order", { load_by_division: WALLBALL }),
      work("Dose the volume and time every later split."),
    ],
  },
  {
    slug: "vr_calf_friendly",
    original: "Spieltag · Wadenschonend",
    session_type: "compromised_run",
    name: "Calf-Friendly Game Day",
    phases: ["build", "peak"],
    needs_erg: true,
    situational: true,
    station: "sled_push",
    keywords: ["wade", "calf", "achilles", "schonend", "low impact"],
    why: "Keeps the race specificity without loading an irritated calf: no jumps, short runs on soft ground.",
    rounds: 3,
    lines: [
      run(500, "Easy-brisk, on soft ground"),
      work("SkiErg", { distance_m: 1000 }),
      work("Sled push", { distance_m: 50, load_by_division: PUSH }),
      work("Sled pull", { distance_m: 50, load_by_division: PULL }),
      work("Row", { distance_m: 1000 }),
      work("Farmers carry", { distance_m: 200, load_by_division: FARMERS }),
    ],
  },

  // ══ Simulation ════════════════════════════════════════════════════════════
  {
    slug: "vr_full_simulation",
    original: "Spieltag · Volle Simulation · Live-Splits",
    session_type: "full_sim",
    name: "Full Simulation",
    phases: ["build", "peak"],
    why: "Pacing, transitions and how fatigue builds across the race order — and the concrete gaps to your targets.",
    lines: [
      work("Race-day routine: breakfast 2-3 h before, the same warm-up, the same shoes"),
      work("8 × (1 km run + station) in race order: SkiErg, sled push, sled pull, burpee broad jumps, row, farmers carry, lunges, wall balls", {
        load_by_division: PUSH,
      }),
      work("Time every run, every station and the roxzone separately — then enter them under Benchmarks → Races & simulations."),
    ],
  },
];

/**
 * The collection's session for a slot, or null when it has none for this
 * session type and phase (the library then decides). Same picker as the
 * library variants: rotation, with every second week aimed at the weakest
 * station or a stated weakness. A situational session only enters when a
 * weakness names it. `occurrence` spreads a second session of the same type
 * in one week (strength A and B) onto the next variant.
 */
export function pickCollectionWorkout(
  collection: WorkoutCollection | string | null | undefined,
  query: VariantQuery,
  occurrence = 0,
  /** How many sessions of this type the week holds. */
  count = 1,
): VariantPick<CollectionWorkout> | null {
  if (collection !== "verona") return null;
  const words = (query.weaknesses ?? []).map((w) => w.toLowerCase());
  const catalogue = VERONA_WORKOUTS.filter(
    (w) => !w.situational || (w.keywords ?? []).some((k) => words.some((x) => x.includes(k))),
  );
  // Several sessions of one type in a week walk the collection in its own
  // order — the first strength day is Strength A, the second Strength B, as
  // the original plan had them — instead of rotating each one separately.
  if (count > 1) {
    const eligible = catalogue.filter(
      (w) =>
        w.session_type === query.sessionType &&
        w.phases.includes(query.phase) &&
        (!w.needs_erg || query.equipment !== "home_minimal"),
    );
    if (eligible.length >= 2) {
      return { variant: eligible[occurrence % eligible.length], targeted: false, pool: eligible.length };
    }
  }
  return pickVariant(catalogue, { ...query, weekNumber: query.weekNumber + occurrence });
}

/** The block content: a rounds header when there are rounds, then the lines. */
export function renderCollectionWorkout(w: CollectionWorkout): SessionLine[] {
  if (!w.rounds || w.rounds <= 1) return w.lines;
  const rest = w.rest_between_rounds_sec;
  return [
    {
      exercise: `${w.rounds} rounds${rest ? ` — ${rest >= 60 ? `${Math.round(rest / 60)} min` : `${rest} s`} between rounds` : ""}`,
      ...(rest ? { rest_sec: rest } : {}),
    },
    ...w.lines,
  ];
}

/** Which session types the collection covers at all, per phase — for the settings page. */
export function collectionCoverage(): Record<string, SessionType[]> {
  const out: Record<string, SessionType[]> = {};
  for (const w of VERONA_WORKOUTS) {
    for (const p of w.phases) {
      out[p] ??= [];
      if (!out[p].includes(w.session_type)) out[p].push(w.session_type);
    }
  }
  return out;
}
