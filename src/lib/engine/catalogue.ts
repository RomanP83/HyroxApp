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
  PaceZones,
  PhaseType,
  Station,
  StationTiers,
} from "./types";
import { weightedStationOrder } from "./stationFocus";

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
  /** The station this session is built around — its headline. */
  station?: Station;
  /**
   * EVERY station the session actually trains, headline included.
   *
   * `station` alone was a label, not a description: only 3 of the 60 station
   * sessions train a single station, and 137 station appearances across the two
   * catalogues went undeclared. Anything that reasons about how much a station
   * gets trained has to read this, or it reasons about labels — the farmers
   * carry was the headline of one session in a sixteen-week plan and appeared
   * in eight.
   *
   * Empty is a real answer: goblet squats between two runs train no Hyrox
   * station, and neither do roxzone transition drills.
   *
   * Strength sessions carry none of this on purpose. They are here to make the
   * athlete stronger, not to train a station, and counting them would say the
   * plan covers stations it does not.
   */
  stations?: Station[];
  /** Needs a SkiErg / RowErg to run at all. */
  needs_erg?: boolean;
  /**
   * The pace zone this session is actually run at.
   *
   * Without it a catalogue inherits one zone for its whole session type, and
   * the interval catalogue spans three: a 25-minute LT2 block and a set of
   * 400s at 3 k pace are not the same effort at the same number. "mixed" means
   * no single zone describes it — an alternation, a progression, strides off a
   * race-pace rep — and the card then shows no target pace rather than a wrong
   * one. Undefined falls back to the session type's own zone.
   */
  pace_zone?: keyof PaceZones | "mixed";
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
  /**
   * What each station is costing this athlete, in seconds (stationCosts). The
   * pool's own weeks are apportioned across the stations it can serve in
   * proportion to these, floor and ceiling applied — see stationFocus.ts.
   *
   * A level-and-phase pool holds three sessions covering three of the eight
   * stations, so weighting can only ever choose among those three. Weighting
   * across all eight would need a catalogue that covers all eight per phase.
   */
  stationCosts?: Partial<Record<Station, number>>;
  /** Which week of its phase this is, 1-based, and how many the phase has. */
  weekInPhase?: number;
  phaseWeeks?: number;
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
 * The running metres a session actually prescribes: rounds × Σ(sets × distance)
 * over its run lines.
 *
 * This is data the session was written with, not an estimate. The weekly total
 * used to come from duration × running_fraction ÷ pace alone, which reads a
 * 75-minute interval session as 15.6 km when what is written is 5 × 1500 m with
 * full recovery — 7.5 km. Rest is not running, and only the session knows how
 * much of it there is.
 *
 * Erg metres and carries are excluded: is_run is exactly the line that says
 * "this counts as mileage".
 */
export function runMetresOf(session: CatalogueSession): number {
  const perRound = session.lines
    .filter((l) => l.is_run && l.distance_m)
    .reduce((n, l) => n + (l.distance_m ?? 0) * Math.max(1, l.sets ?? 1), 0);
  return perRound * Math.max(1, session.rounds);
}

/**
 * Every station a session trains.
 *
 * `stations` is authoritative where it is set; the headline is the fallback for
 * anything that predates the field, so a catalogue without it still behaves as
 * it did rather than silently training nothing.
 */
export function trainedStations(session: CatalogueSession): Station[] {
  if (session.stations?.length) return session.stations;
  return session.station ? [session.station] : [];
}

/**
 * The station this week should go after, chosen from what the pool can serve.
 *
 * Returns null when the caller gave no phase position or no costs — a single
 * session built outside a plan has no phase to apportion across, and falls back
 * to the weakest-station bias it always had.
 */
function weightedFocus<T extends CatalogueSession>(
  eligible: T[],
  q: CatalogueQuery,
): Station | null {
  if (!q.stationCosts || !q.weekInPhase || !q.phaseWeeks) return null;
  // Everything the pool can train, not everything it is labelled with.
  const stations = [...new Set(eligible.flatMap((s) => trainedStations(s)))];
  if (!stations.length) return null;
  const order = weightedStationOrder(stations, q.stationCosts, q.phaseWeeks);
  return order.length ? order[(q.weekInPhase - 1) % order.length] : null;
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

  // The station this week goes after: the pool's own weeks, apportioned across
  // the stations this pool can actually serve, weighted by what they cost.
  const scheduled = weightedFocus(eligible, q);
  // A weakness the athlete typed in themselves still counts either way — they
  // know something the tiers do not.
  const focus = scheduled ?? weakestStation(q.stationTiers);
  const words = (q.weaknesses ?? []).map((w) => w.toLowerCase());
  const targeted = eligible.filter((s) => {
    const trains = trainedStations(s);
    return (
      (focus && trains.includes(focus)) ||
      trains.some((st) => words.some((w) => w.includes(st.replace(/_/g, " "))))
    );
  });

  // With a schedule the focus changes week to week, so it fires every week.
  // WITHOUT one the focus is the weakest station and never moves, and firing it
  // every week would be the same session every week — so that case keeps the
  // alternation it was given for exactly that reason.
  if (targeted.length && (scheduled != null || q.weekNumber % 2 === 1)) {
    return {
      // Several sessions for one station in a phase: rotate through them so a
      // station that comes up four times is not the same session four times.
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
