// ============================================================================
// What a levelled session catalogue is, and how one session gets picked.
//
// Two catalogues are written this way — compromised running and station work.
// Both hold three sessions per (level, phase), both are seeded into
// workout_blocks under a pinned id, and both are chosen by the same rule:
// rotate by week, and every second week go after the weakest station. The rule
// lives here once, so the two can never drift into behaving differently.
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

export interface CatalogueSession {
  /**
   * The workout_blocks row this session is stored as. Pinned rather than
   * generated, because the engine names it while building a plan and the
   * database has to find that exact row — an id that differed per install
   * would make the plan unsavable. Recipe for a new one:
   * uuidv5(uuidv5(URL_NS, "https://hyroxapp.local/workout_blocks"), slug).
   */
  block_id: string;
  slug: string;
  /**
   * How many times through `lines`. Data, not prose: without it nothing can
   * work out how far a session actually goes, and the round count would drift
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

export interface CataloguePick<T extends CatalogueSession> {
  session: T;
  /** Chosen to attack a stated or measured weakness, not by rotation. */
  targeted: boolean;
  /** How many sessions this level and phase had to choose from. */
  pool: number;
}

export interface CatalogueQuery {
  level: ExperienceLevel;
  phase: PhaseType;
  weekNumber: number;
  equipment: EquipmentAccess;
  stationTiers: StationTiers;
  /** Free-text weaknesses from the profile, matched against station names. */
  weaknesses?: string[];
}

function hasErg(equipment: EquipmentAccess): boolean {
  return equipment !== "home_minimal";
}

/**
 * The station the athlete is weakest at, or null when nothing stands out.
 *
 * Deliberately stricter than runVariants' namesake. A catalogue only bends
 * towards a weakness when there is one: if every station sits at the same
 * tier — which is exactly where a new athlete starts — there is no weakest
 * station, and calling one of them weakest would hand it half of the cycle.
 */
function weakestStation(tiers: StationTiers): Station | null {
  const entries = Object.entries(tiers) as [Station, number][];
  if (entries.length < 2) return null;
  const lowest = Math.min(...entries.map(([, tier]) => tier));
  if (lowest >= 3 || entries.every(([, tier]) => tier === lowest)) return null;
  // Deterministic: alphabetical among equals, so the same state picks the same.
  return entries
    .filter(([, tier]) => tier === lowest)
    .map(([station]) => station)
    .sort()[0];
}

/**
 * One session for this athlete, this phase, this week.
 *
 * Every second week goes after the weakest station, and the weeks in between
 * deliberately exclude it — a "weakness focus" that fires every week is just
 * the same session every week.
 *
 * Falls back down the levels when a level and phase has nothing left after the
 * equipment filter: a home-gym athlete without an erg still gets the session,
 * just not the version that needs a SkiErg.
 */
export function pickFromCatalogue<T extends CatalogueSession>(
  catalogue: T[],
  q: CatalogueQuery,
): CataloguePick<T> | null {
  const byLevel = catalogue.filter((s) => s.level === q.level && s.phase === q.phase);
  let eligible = byLevel.filter((s) => !s.needs_erg || hasErg(q.equipment));
  if (!eligible.length) {
    eligible = catalogue.filter(
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
  // Count the weeks this pool is actually used in, not the calendar weeks.
  // When a weakness owns every odd week, stepping by the week number would
  // only ever land on the same parity of index — the third session in the pool
  // would never be prescribed at all.
  const step = targeted.length ? Math.floor((q.weekNumber - 1) / 2) : q.weekNumber - 1;
  return {
    session: pool[step % pool.length],
    targeted: false,
    pool: eligible.length,
  };
}

/** Whole minutes read as minutes; 90 seconds is 90 seconds, not "2 min". */
function restText(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`;
}

/**
 * The session as lines to draw, round count included. One place builds it, so
 * the prose and the number can never disagree.
 */
export function renderCatalogue(session: CatalogueSession): SessionLine[] {
  if (session.rounds <= 1) return session.lines;
  const rest = session.rest_between_rounds_sec;
  return [
    {
      exercise: `${session.rounds} rounds${rest ? ` — ${restText(rest)} between rounds` : ""}`,
      ...(rest ? { rest_sec: rest } : {}),
    },
    ...session.lines,
  ];
}
