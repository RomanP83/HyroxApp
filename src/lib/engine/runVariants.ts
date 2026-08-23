// ============================================================================
// Variants of the four core run sessions.
//
// A twelve-week plan that prescribes the same interval session twelve times is
// not a plan, it is a template. Each core session therefore has several shapes,
// and the engine picks one per week — deterministically, so the same athlete in
// the same week always gets the same session, and explainably, so the card can
// say why this one.
//
// Selection, in order:
//   1. the variants that belong in this phase and that the athlete can run
//      (an erg session needs an erg)
//   2. every second week, the variant that attacks the athlete's weakest
//      station or a named weakness — the rest of the time it rotates evenly
//
// The blocks themselves live in the library (supabase/seed + migration 0018);
// this table is the coaching layer that decides which one a week gets.
// ============================================================================

import type { EquipmentAccess, PhaseType, SessionType, Station, StationTiers } from "./types";
import type { RunSessionType } from "./running";

export interface SessionVariant {
  /** Library block slug this variant renders from. */
  slug: string;
  session_type: SessionType;
  name: string;
  /** Phases the variant belongs in. */
  phases: PhaseType[];
  /** Needs an erg (SkiErg / RowErg / bike) to run at all. */
  needs_erg?: boolean;
  /** The station this session hammers — drives the weakness bias. */
  station?: Station;
  /** Words that make this the right answer to a stated weakness. */
  keywords?: string[];
  /** One line on the card: what this shape is for. */
  why: string;
  /** When the terrain or kit is not available, do this instead. */
  fallback?: string;
}

/** A variant of one of the four core run sessions. */
export type RunVariant = SessionVariant & { session_type: RunSessionType };

export const RUN_VARIANTS: RunVariant[] = [
  // ── 1. Zone 2 long run ────────────────────────────────────────────────
  {
    slug: "lr_flat_steady",
    session_type: "long_run",
    name: "Flat Steady Long Run",
    phases: ["base", "build", "peak", "taper"],
    why: "Flat and continuous, strictly Zone 2 — pure metabolic efficiency and fat metabolism.",
  },
  {
    slug: "lr_rolling_hills",
    session_type: "long_run",
    name: "Rolling Hills Z2",
    phases: ["base", "build"],
    keywords: ["hill", "berg", "wade", "calf", "hüft", "hip"],
    why: "Rolling profile with the pace deliberately dropped on the climbs — calf and hip-extensor endurance without leaving Zone 2.",
    fallback: "No hills nearby? A treadmill at 2-4% does the same job, or keep it flat and hold the zone.",
  },
  {
    slug: "lr_progression",
    session_type: "long_run",
    name: "Progression Long Run",
    phases: ["build", "peak"],
    keywords: ["schwelle", "threshold", "laktat", "lactate"],
    why: "Zone 2 for the first two thirds, then progressively into upper Zone 3 — aerobic volume that finishes at the threshold.",
  },

  // ── 2. Easy / recovery run ────────────────────────────────────────────
  {
    slug: "er_shakeout_strides",
    session_type: "run_easy",
    name: "Shakeout + Strides",
    phases: ["base", "build", "peak", "taper"],
    why: "Very easy jogging plus a handful of 80 m strides — circulation, and neural freshness for the next hard day.",
  },
  {
    slug: "er_soft_surface",
    session_type: "run_easy",
    name: "Soft-Surface Recovery",
    phases: ["base", "build", "peak", "taper"],
    keywords: ["knie", "knee", "schienbein", "shin", "gelenk", "joint", "impact"],
    why: "Grass or forest floor at RPE 1-3 — the same blood flow with a fraction of the joint load after heavy leg days.",
    fallback: "No trail? Keep it flat and slow on the softest surface you have.",
  },
  {
    slug: "er_cross_combo",
    session_type: "run_easy",
    name: "Cross-Training Combo",
    phases: ["base", "build", "peak"],
    needs_erg: true,
    why: "Half the session on the erg or bike in Zone 1 — the aerobic work stays, the impact on the legs halves.",
  },

  // ── 3. Threshold & VO₂max intervals ───────────────────────────────────
  {
    slug: "iv_vo2_1k",
    session_type: "run_intervals",
    name: "VO₂max 1k Repeats",
    phases: ["base", "build", "peak"],
    keywords: ["vo2", "tempo", "speed", "schnelligkeit"],
    why: "5-6 × 1000 m at 3k-5k effort with full jog recovery — maximum oxygen uptake and pace feel.",
  },
  {
    slug: "iv_cruise_2k",
    session_type: "run_intervals",
    name: "Threshold Cruise Intervals",
    phases: ["base", "build"],
    keywords: ["schwelle", "threshold", "laktat", "lactate", "tolerance"],
    why: "Long reps at 10k-half pace with only 60-90 s standing rest — lactate clearance while the clock keeps running.",
  },
  {
    slug: "iv_pyramid",
    session_type: "run_intervals",
    name: "Pyramid Intervals",
    phases: ["build", "peak"],
    why: "400 up to 1600 and back down, each rep at its own race pace — pace judgement across every gear you own.",
  },
  {
    slug: "iv_30_30",
    session_type: "run_intervals",
    name: "30/30 Short Reps",
    phases: ["peak", "taper"],
    keywords: ["anaerob", "anaerobic", "kick", "sprint"],
    why: "Ten-minute blocks of 30 s hard, 30 s jog — anaerobic capacity without the muscular cost of long reps.",
  },

  // Compromised running is NOT here. It is prescribed per level as well as
  // per phase — sixty sessions across five levels and four phases — and lives
  // in compromisedSessions.ts, which fill.ts consults before this catalogue.
];

function hasErg(equipment: EquipmentAccess): boolean {
  return equipment !== "home_minimal";
}

/** The station the athlete is currently weakest at, if the tiers say so. */
export function weakestStation(tiers: StationTiers | undefined): Station | null {
  if (!tiers) return null;
  const entries = Object.entries(tiers) as [Station, number][];
  if (!entries.length) return null;
  const lowest = Math.min(...entries.map(([, tier]) => tier));
  const candidates = entries.filter(([, tier]) => tier === lowest).map(([station]) => station);
  // Deterministic: alphabetical among equals, so the same state picks the same.
  return candidates.sort()[0] ?? null;
}

export interface VariantPick<V extends SessionVariant = SessionVariant> {
  variant: V;
  /** True when the pick was steered by a weakness rather than the rotation. */
  targeted: boolean;
  /** How many variants were available to rotate through. */
  pool: number;
}

export interface VariantQuery {
  sessionType: SessionType;
  phase: PhaseType;
  /** Plan-global week number, 1-based — drives the rotation. */
  weekNumber: number;
  equipment: EquipmentAccess;
  stationTiers?: StationTiers;
  /** Free-text weaknesses from the profile. */
  weaknesses?: string[];
}

/**
 * Which shape this week's session takes. Deterministic in (session type, phase,
 * week) — with every second week steered towards the athlete's weakest station
 * or a stated weakness, so a known gap gets attacked without the plan turning
 * into the same session over and over.
 *
 * Shared by the run and the station catalogues: the coaching rule is the same,
 * only the sessions differ.
 */
export function pickVariant<V extends SessionVariant>(
  catalogue: V[],
  opts: VariantQuery,
): VariantPick<V> | null {
  const eligible = catalogue.filter(
    (v) =>
      v.session_type === opts.sessionType &&
      v.phases.includes(opts.phase) &&
      (!v.needs_erg || hasErg(opts.equipment)),
  );
  if (!eligible.length) return null;

  const weak = weakestStation(opts.stationTiers);
  const words = (opts.weaknesses ?? []).map((w) => w.toLowerCase());
  const targetedVariants = eligible.filter(
    (v) =>
      (weak && v.station === weak) ||
      (v.keywords ?? []).some((k) => words.some((w) => w.includes(k))),
  );

  // Every second week goes after the weakness. The weeks in between exclude it
  // on purpose — otherwise the rotation keeps landing on the same variant and
  // a "weakness focus" quietly becomes "the same session every week".
  if (targetedVariants.length && opts.weekNumber % 2 === 1) {
    const variant = targetedVariants[Math.floor((opts.weekNumber - 1) / 2) % targetedVariants.length];
    return { variant, targeted: true, pool: eligible.length };
  }
  const rest = targetedVariants.length
    ? eligible.filter((v) => !targetedVariants.includes(v))
    : eligible;
  const pool = rest.length ? rest : eligible;
  return {
    variant: pool[Math.floor((opts.weekNumber - 1) / (targetedVariants.length ? 2 : 1)) % pool.length],
    targeted: false,
    pool: eligible.length,
  };
}

/** The run catalogue, through the shared picker. */
export function pickRunVariant(opts: VariantQuery): VariantPick<RunVariant> | null {
  return pickVariant(RUN_VARIANTS, opts);
}
