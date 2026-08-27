// ============================================================================
// Engine domain types (Implementation Plan §5)
// Pure data — no Supabase coupling, so the engine stays deterministic & testable
// and can run either in a Next.js route handler or a Supabase Edge Function.
// ============================================================================

export type Division = "open" | "pro" | "doubles" | "masters_open" | "masters_pro";
/** The four stages of the block between goals (constants.ts holds their specs). */
export type TransitionModule = "reset" | "reintroduction" | "reload" | "offseason";
export type ExperienceLevel =
  | "beginner"
  | "intermediate"
  | "advanced"
  | "elite"
  | "world_class";
export type EquipmentAccess = "full_gym" | "home_minimal" | "hybrid";
export type PhaseType = "base" | "build" | "peak" | "taper";

export type SessionType =
  | "long_run"
  | "run_easy"
  | "run_intervals"
  | "compromised_run"
  | "strength"
  | "station_work"
  | "full_sim"
  | "mobility"
  | "benchmark"
  | "race_day"
  | "rest";

export type Station =
  | "ski_erg"
  | "sled_push"
  | "sled_pull"
  | "burpee_broad_jump"
  | "row"
  | "farmers_carry"
  | "sandbag_lunges"
  | "wall_balls"
  | "run"
  | "general";

export type EquipmentVariant = "gym" | "home";
export type BlockType = "warmup" | "main" | "mobility" | "finisher";

/** The 8 competition stations that carry their own progression tier (PP2). */
export const STATIONS: Station[] = [
  "ski_erg",
  "sled_push",
  "sled_pull",
  "burpee_broad_jump",
  "row",
  "farmers_carry",
  "sandbag_lunges",
  "wall_balls",
];

export interface PaceZones {
  easy_sec_km: number;
  tempo_sec_km: number;
  interval_sec_km: number;
  race_sec_km: number;
}

export type StationTiers = Record<string, number>; // station -> tier 1..3

export type DaySlot = "am" | "pm";

/** One benchmark result, latest per test. */
export interface BenchmarkSample {
  slug: string; // benchmark_definitions.slug
  value: number; // metric value (sec, reps, or m)
}

export interface AthleteProfile {
  id: string;
  division: Division;
  /**
   * What this athlete can currently carry: it steers the training mix, the
   * level-keyed catalogues, the session frequency and the default tiers.
   * Deliberately NOT the goal — see goal_race_time_sec.
   */
  experience_level: ExperienceLevel;
  /**
   * The finish time the athlete is actually training for, in seconds. Ability
   * and ambition are different numbers and an athlete is allowed to have both:
   * running 1:30 today and wanting sub 70 is a training plan, not a
   * contradiction. Null until set; goalSecondsForLevel supplies the default.
   */
  goal_race_time_sec?: number | null;
  five_k_seconds: number | null;
  station_estimates: Record<string, number>;
  training_days_per_week: number; // 3..6
  /** How many days per week may carry a second (PM) session. 0..3. */
  doubles_per_week?: number;
  /** Highest weekly running volume of the cycle; the phase curve does the rest. */
  weekly_km_peak?: number | null;
  /** How many sessions a week should be runs. Unset = the phase decides. */
  runs_per_week?: number | null;
  /** Stated weaknesses ("Sled Push", "Laktattoleranz") — steer session choice. */
  weaknesses?: string[] | null;
  equipment_access: EquipmentAccess;
  /**
   * The athlete's own week shape, 1 = Monday … 7 = Sunday. These are hard
   * pins: the plan honours them even when they collide with the recovery
   * rules, and reports the collision instead of quietly overruling the
   * athlete (assessWeekPreferences).
   */
  preferred_long_run_day?: number | null;
  preferred_strength_days?: number[] | null;
  preferred_rest_days?: number[] | null;
  /** Weekdays that must carry the second session, when doubles are on. */
  preferred_double_days?: number[] | null;
}

export interface AthleteState {
  acute_load_7d: number;
  chronic_load_28d: number;
  acwr: number;
  pace_zones: PaceZones;
  station_tiers: StationTiers;
  /**
   * Station splits from the athlete's last race, in seconds. The tier is an
   * ordinal guess; this is what the clock said. Present only once a race has
   * been logged — until then the tiers carry the estimate on their own.
   */
  measured_station_seconds?: Partial<Record<Station, number>>;
  predicted_race_time_sec: number | null;
  /** Persisted strength-load multiplier the ±5% calibration steps (A6). */
  strength_modifier: number;
  /** Weekly snapshot the ±3% pace cap is measured against (A7). */
  pace_zones_ref: PaceZones;
  pace_ref_at: string | null;
}

export interface WorkoutBlock {
  id: string;
  slug?: string;
  block_type: BlockType;
  station: Station | null;
  content: unknown[]; // rendered as-is into the UI
  equipment_variant: EquipmentVariant;
  difficulty_tier: number; // 1..3
  session_types: SessionType[];
  tags: string[];
}

// ── Generated plan tree ─────────────────────────────────────────────────────

export interface RenderedBlock {
  block_id: string;
  slug?: string;
  block_type: BlockType;
  station: Station | null;
  content: unknown[];
  sort_order: number;
  /** Engine-rendered, profile-specific overrides recorded at generation time. */
  load_adjustments: {
    division: Division;
    station_tier?: number;
    pace_sec_km?: number;
    /** Multiplier on the block's template loads (strength calibration, A6). */
    strength_modifier?: number;
    /** Which shape of the core session this is, and why (runVariants.ts). */
    variant_name?: string;
    variant_why?: string;
    variant_fallback?: string;
    /** True when the variant was chosen to attack a weakness, not by rotation. */
    variant_targeted?: boolean;
    /** Compromised running: pace for the first metres out of a station. */
    opening_pace_sec_km?: number;
    opening_distance_m?: number;
    stabilise_distance_m?: number;
    note?: string;
  };
}

export interface GeneratedSession {
  day_hint: number; // 1..7
  /** Which half of the day; "pm" is the second session of a double day. */
  day_slot: DaySlot;
  session_type: SessionType;
  title: string;
  planned_duration_min: number;
  intensity_rpe_target: number; // 1..10
  sort_order: number;
  blocks: RenderedBlock[];
}

export interface GeneratedWeek {
  week_number: number; // 1-based, plan-global
  is_deload: boolean;
  is_benchmark_week: boolean;
  /** Races from the calendar that fall in this week, if any. */
  races?: { date: string; type: string; priority: "A" | "B" | "C"; day_hint: number }[];
  weekly_goal: string;
  target_sessions: number;
  sessions: GeneratedSession[];
}

export interface GeneratedPhase {
  phase_type: PhaseType;
  sort_order: number;
  start_week: number;
  end_week: number;
  focus_description: string;
  volume_multiplier: number;
  weeks: GeneratedWeek[];
}

export interface GeneratedPlan {
  total_weeks: number;
  engine_version: string;
  phases: GeneratedPhase[];
}

export interface GenerateInput {
  profile: AthleteProfile;
  state: AthleteState;
  library: WorkoutBlock[];
  weeksToRace: number;
  /**
   * "race" periodises towards a race day; "transition" is the block between
   * goals — base work at maintenance load, no benchmark, no simulation, no
   * taper, because there is nothing to taper into. See transitionPhasePlan.
   */
  mode?: "race" | "transition";
  /**
   * Which transition module the block opens on. A block that continues one —
   * no race in the calendar, the last simply ran out — starts at the
   * off-season: the three days of nothing belong after a race, not after a
   * loading cycle.
   */
  firstModule?: TransitionModule;
  /**
   * Any date inside plan week 1 (normally today). Only needed when races are
   * passed: it anchors the plan grid so a calendar date can be resolved to a
   * plan day.
   */
  startDate?: string;
  /**
   * The athlete's race calendar. The main (A) race is the one the plan is
   * built towards; B and C races ride inside it and bend the days around
   * them (see raceCalendar.ts).
   */
  races?: { date: string; type: string; priority: "A" | "B" | "C" }[];
  /**
   * Sessions the athlete moved by hand, keyed by the CALENDAR week they belong
   * to. Needs `startDate` to resolve a plan week to its Monday. A generated
   * week is a proposal; a rearranged week is a decision, and a rebase must not
   * undo a decision (see applyDayOverrides).
   */
  dayOverrides?: {
    week_start: string;
    session_type: SessionType;
    day_hint: number;
    day_slot: DaySlot;
  }[];
}
