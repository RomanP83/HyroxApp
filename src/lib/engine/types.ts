// ============================================================================
// Engine domain types (Implementation Plan §5)
// Pure data — no Supabase coupling, so the engine stays deterministic & testable
// and can run either in a Next.js route handler or a Supabase Edge Function.
// ============================================================================

export type Division = "open" | "pro" | "doubles" | "masters_open" | "masters_pro";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type EquipmentAccess = "full_gym" | "home_minimal" | "hybrid";
export type PhaseType = "base" | "build" | "peak" | "taper";

export type SessionType =
  | "run_easy"
  | "run_intervals"
  | "compromised_run"
  | "strength"
  | "station_work"
  | "full_sim"
  | "mobility"
  | "benchmark"
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

export interface AthleteProfile {
  id: string;
  division: Division;
  experience_level: ExperienceLevel;
  five_k_seconds: number | null;
  station_estimates: Record<string, number>;
  training_days_per_week: number; // 3..6
  /** How many days per week may carry a second (PM) session. 0..3. */
  doubles_per_week?: number;
  equipment_access: EquipmentAccess;
}

export interface AthleteState {
  acute_load_7d: number;
  chronic_load_28d: number;
  acwr: number;
  pace_zones: PaceZones;
  station_tiers: StationTiers;
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
}
