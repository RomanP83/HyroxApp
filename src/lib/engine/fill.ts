// ============================================================================
// Fill layer (Implementation Plan §5, Schritt 3)
// Each slot pulls workout_blocks by (session_type, equipment_variant, station
// rotation) and renders loads from the LIVE athlete_state.station_tiers /
// pace_zones — so the same week renders differently once the athlete changes.
// ============================================================================

import type {
  AthleteProfile,
  AthleteState,
  EquipmentVariant,
  PaceZones,
  PhaseType,
  RenderedBlock,
  SessionType,
  Station,
  WorkoutBlock,
} from "./types";
import { STATIONS } from "./types";
import { COMPROMISED_OPENING, compromisedOpeningPace, isRunSession, runSpec } from "./running";
import { ergOffloadVariant, pickRunVariant, type VariantPick } from "./runVariants";
import { pickStationVariant } from "./stationVariants";
import { pickStrengthFinisher, pickStrengthVariant } from "./strengthVariants";
import { pickCompromisedSession, renderCompromised } from "./compromisedSessions";
import { pickStationSession, renderStation } from "./stationSessions";
import { pickIntervalSession, renderInterval } from "./intervalSessions";
import type { SessionSlot } from "./micro";

function variantFor(profile: AthleteProfile): EquipmentVariant {
  return profile.equipment_access === "home_minimal" ? "home" : "gym";
}

/**
 * Single source of truth for the weekly station rotation (A9). Used by plan
 * generation, the adaptive runner, and the demo — keep them from drifting.
 */
export function stationForWeek(weekNumber: number): Station {
  return STATIONS[(weekNumber - 1) % STATIONS.length];
}

/** Which pace zone a session type runs at — one table, in running.ts. */
function paceForSession(state: AthleteState, type: SessionType): number | undefined {
  const spec = runSpec(type);
  return spec ? state.pace_zones[spec.pace_zone] : undefined;
}

/**
 * The pace a catalogue session is actually run at, and the zone it belongs to.
 *
 * A session type carries one zone, and the interval catalogue spans three: a
 * 25-minute block at LT2 and a set of 400s at 3 k pace both used to display the
 * interval pace, which was wrong for two thirds of the catalogue. Where a
 * session names its own zone, that wins; "mixed" means no single number
 * describes it, and the card is better off showing none than showing one that
 * is wrong.
 */
function paceForCatalogueSession(
  state: AthleteState,
  session: { pace_zone?: keyof PaceZones | "mixed" },
  fallback: number | undefined,
): { pace_sec_km?: number; pace_zone?: keyof PaceZones } {
  if (session.pace_zone === "mixed") return {};
  if (session.pace_zone) {
    return { pace_sec_km: state.pace_zones[session.pace_zone], pace_zone: session.pace_zone };
  }
  return fallback != null ? { pace_sec_km: fallback } : {};
}

interface PickOpts {
  library: WorkoutBlock[];
  sessionType: SessionType;
  blockType: WorkoutBlock["block_type"];
  variant: EquipmentVariant;
  station?: Station | null;
  targetTier?: number;
}

/** Pick the best-matching block: variant + session type, tier proximity, station. */
function pickBlock(opts: PickOpts): WorkoutBlock | undefined {
  const { library, sessionType, blockType, variant, station, targetTier } = opts;
  let candidates = library.filter(
    (b) => b.block_type === blockType && b.session_types.includes(sessionType),
  );
  // Long runs and recovery runs share the library's run blocks; the "long" tag
  // is what separates a 80-minute Zone-2 block from a 6 km shake-out. Typing
  // them apart would mean a new enum value in the seed, which a single-
  // transaction setup.sql cannot do (see migration 0016).
  if (sessionType === "long_run") {
    const runBlocks = library.filter(
      (b) => b.block_type === blockType && b.session_types.includes("run_easy"),
    );
    const long = runBlocks.filter((b) => b.tags.includes("long"));
    candidates = long.length ? long : runBlocks;
  } else if (sessionType === "run_easy") {
    const short = candidates.filter((b) => !b.tags.includes("long"));
    if (short.length) candidates = short;
  }
  // Variant: exact match, else allow gym as universal fallback.
  const variantMatch = candidates.filter((b) => b.equipment_variant === variant);
  if (variantMatch.length) candidates = variantMatch;
  else candidates = candidates.filter((b) => b.equipment_variant === "gym");

  if (station) {
    const stationMatch = candidates.filter((b) => b.station === station);
    if (stationMatch.length) candidates = stationMatch;
  }
  if (!candidates.length) return undefined;

  if (targetTier != null) {
    candidates = [...candidates].sort(
      (a, b) =>
        Math.abs(a.difficulty_tier - targetTier) - Math.abs(b.difficulty_tier - targetTier),
    );
  }
  return candidates[0];
}

function render(
  block: WorkoutBlock,
  profile: AthleteProfile,
  sortOrder: number,
  extras: RenderedBlock["load_adjustments"],
): RenderedBlock {
  return {
    block_id: block.id,
    slug: block.slug,
    block_type: block.block_type,
    station: block.station,
    content: block.content,
    sort_order: sortOrder,
    load_adjustments: extras,
  };
}

/**
 * Fill one session slot with warm-up + main (+ mobility) blocks.
 * weekNumber drives station rotation so different stations surface week to week.
 */
export function fillSession(
  slot: SessionSlot,
  profile: AthleteProfile,
  state: AthleteState,
  library: WorkoutBlock[],
  weekNumber: number,
  /** Which phase the week belongs to — decides which variants are eligible. */
  phase?: PhaseType,
): RenderedBlock[] {
  const variant = variantFor(profile);
  const blocks: RenderedBlock[] = [];
  let order = 0;

  if (slot.session_type === "rest") return blocks;
  // A race day has no prescription to render: the event is the session, and
  // its warm-up belongs to the athlete's own routine, not to the library.
  if (slot.session_type === "race_day") return blocks;
  if (slot.session_type === "mobility") {
    const mob = pickBlock({ library, sessionType: "mobility", blockType: "mobility", variant });
    if (mob) blocks.push(render(mob, profile, order++, { division: profile.division }));
    return blocks;
  }

  // Station rotation: the primary station this week for station_work.
  const rotatedStation = stationForWeek(weekNumber);
  const isStationWork = slot.session_type === "station_work";
  const station = isStationWork ? rotatedStation : undefined;
  const targetTier = station ? state.station_tiers[station] ?? 2 : undefined;
  const pace = paceForSession(state, slot.session_type);

  // Warm-up (skip for pure mobility, already handled).
  const wu = pickBlock({ library, sessionType: slot.session_type, blockType: "warmup", variant });
  if (wu) blocks.push(render(wu, profile, order++, { division: profile.division }));

  // Main block. For a run session the variant layer decides the shape of the
  // week (rotation, with every second week aimed at a weakness); the library
  // block it names is used when it is there, otherwise the generic pick stands.
  // Compromised running is prescribed per LEVEL as well as per phase: what a
  // sub-2:00 athlete and a sub-60 athlete do out of a sled is not the same
  // session at a different pace. Those sixty sessions are authored in the
  // engine (compromisedSessions.ts) and seeded into the library under a
  // pinned id, so the block can be named here without looking anything up.
  if (phase && slot.session_type === "compromised_run") {
    const chosen = pickCompromisedSession({
      level: profile.experience_level,
      phase,
      weekNumber,
      equipment: profile.equipment_access,
      stationTiers: state.station_tiers,
      weaknesses: profile.weaknesses ?? undefined,
    });
    if (chosen) {
      blocks.push({
        // The pinned library id, not the slug: this ends up in
        // session_blocks.block_id, which is a uuid with a foreign key.
        block_id: chosen.session.block_id,
        slug: chosen.session.slug,
        block_type: "main",
        station: chosen.session.station ?? null,
        content: renderCompromised(chosen.session),
        sort_order: order++,
        load_adjustments: {
          division: profile.division,
          ...(pace != null
            ? {
                pace_sec_km: pace,
                opening_pace_sec_km: compromisedOpeningPace(pace),
                opening_distance_m: COMPROMISED_OPENING.buffer_distance_m,
                stabilise_distance_m: COMPROMISED_OPENING.stabilise_distance_m,
              }
            : {}),
          variant_name: chosen.session.name,
          variant_why: chosen.session.why,
          variant_targeted: chosen.targeted,
        },
      });
      return blocks;
    }
  }

  // Station work is levelled the same way, and for the same reason: a beginner
  // learning to keep the hips low behind the sled and a sub-60 athlete pushing
  // 50 m in under 1:15 are not doing one session at two weights. Isolated
  // station work also buys strength endurance without the orthopaedic bill of
  // another run, which is why it survives weeks where a hard run would not.
  if (phase && isStationWork) {
    const chosen = pickStationSession({
      level: profile.experience_level,
      phase,
      weekNumber,
      equipment: profile.equipment_access,
      stationTiers: state.station_tiers,
      weaknesses: profile.weaknesses ?? undefined,
    });
    if (chosen) {
      const focus = chosen.session.station ?? station;
      blocks.push({
        block_id: chosen.session.block_id,
        slug: chosen.session.slug,
        block_type: "main",
        station: chosen.session.station ?? null,
        content: renderStation(chosen.session),
        sort_order: order++,
        load_adjustments: {
          division: profile.division,
          // The tier of the station this session actually hammers, not of the
          // one the weekly rotation happened to name.
          station_tier: focus ? state.station_tiers[focus] ?? targetTier : targetTier,
          variant_name: chosen.session.name,
          variant_why: chosen.session.why,
          variant_targeted: chosen.targeted,
        },
      });
      return blocks;
    }
  }

  // Threshold and VO2max intervals are the one running session that carries no
  // station work at all: a sled before the reps caps the speed and blurs the
  // target. Levelled the same way as the other catalogues, and for the same
  // reason — three six-minute efforts and eight kilometre reps off thirty
  // seconds are not one session at two paces.
  if (phase && slot.session_type === "run_intervals") {
    const chosen = pickIntervalSession({
      level: profile.experience_level,
      phase,
      weekNumber,
      equipment: profile.equipment_access,
      stationTiers: state.station_tiers,
      weaknesses: profile.weaknesses ?? undefined,
    });
    if (chosen) {
      blocks.push({
        block_id: chosen.session.block_id,
        slug: chosen.session.slug,
        block_type: "main",
        station: "run",
        content: renderInterval(chosen.session),
        sort_order: order++,
        load_adjustments: {
          division: profile.division,
          ...paceForCatalogueSession(state, chosen.session, pace),
          variant_name: chosen.session.name,
          variant_why: chosen.session.why,
          variant_targeted: chosen.targeted,
        },
      });
      return blocks;
    }
  }

  let picked: VariantPick | null = null;
  let main: WorkoutBlock | undefined;
  if (
    phase &&
    (isRunSession(slot.session_type) ||
      slot.session_type === "station_work" ||
      slot.session_type === "strength")
  ) {
    const query = {
      sessionType: slot.session_type,
      phase,
      weekNumber,
      equipment: profile.equipment_access,
      stationTiers: state.station_tiers,
      weaknesses: profile.weaknesses ?? undefined,
    };
    // Ergometer offloading, made real rather than mentioned. The PM session of
    // a double day is the week's extra aerobic volume — exactly the kilometres
    // that would otherwise be paid for in Achilles and shin loading — so it is
    // the one that moves onto the erg or bike. It is also the only easy run in
    // the week whose slot the athlete did not choose, which makes it the
    // honest place to put the offload instead of overruling a chosen run.
    const ergOffload =
      slot.session_type === "run_easy" &&
      slot.day_slot === "pm" &&
      profile.equipment_access !== "home_minimal";

    const offload = ergOffload ? ergOffloadVariant() : null;
    picked = offload
      ? { variant: offload, targeted: false, pool: 1 }
      : isRunSession(slot.session_type)
        ? pickRunVariant(query)
        : slot.session_type === "strength"
          ? pickStrengthVariant(query)
          : pickStationVariant(query);
    // The demo library carries the slug as its id; the database has both.
    main = picked
      ? library.find((b) => (b.slug ?? b.id) === picked!.variant.slug)
      : undefined;
    if (!main) picked = null;
  }
  main ??= pickBlock({
    library,
    sessionType: slot.session_type,
    blockType: "main",
    variant,
    station,
    targetTier,
  });
  if (main) {
    // A6: strength sessions carry the live calibration multiplier so the UI
    // can render the adjusted loads the engine promised.
    const strengthMod =
      slot.session_type === "strength" && state.strength_modifier !== 1
        ? state.strength_modifier
        : undefined;
    // Coming out of a station the first 400 m carry a buffer on the flat split,
    // and the first 200 m are for breathing — not for making up time.
    const compromised =
      pace != null && (slot.session_type === "compromised_run" || slot.session_type === "full_sim")
        ? {
            opening_pace_sec_km: compromisedOpeningPace(pace),
            opening_distance_m: COMPROMISED_OPENING.buffer_distance_m,
            stabilise_distance_m: COMPROMISED_OPENING.stabilise_distance_m,
          }
        : undefined;
    blocks.push(
      render(main, profile, order++, {
        division: profile.division,
        station_tier: targetTier,
        pace_sec_km: pace,
        strength_modifier: strengthMod,
        ...compromised,
        variant_name: picked?.variant.name,
        variant_why: picked?.variant.why,
        variant_fallback: picked?.variant.fallback,
        variant_targeted: picked?.targeted,
        note: station ? `${station} focus @ tier ${targetTier}` : undefined,
      }),
    );
  }

  // A strength day carries a finisher — this is where plyometrics and grip
  // work live, because both only do their job in a rested state. Nothing
  // attached finishers before, which is why the library's grip block was never
  // once prescribed.
  if (phase && slot.session_type === "strength") {
    const finisher = pickStrengthFinisher(weekNumber, phase);
    const block = library.find((b) => (b.slug ?? b.id) === finisher.slug);
    if (block) {
      blocks.push(
        render(block, profile, order++, {
          division: profile.division,
          variant_name: finisher.name,
          variant_why: finisher.why,
        }),
      );
    }
  }

  // A short mobility cap on hard, non-run days for recovery hygiene.
  if (["strength", "station_work", "compromised_run"].includes(slot.session_type)) {
    const mob = pickBlock({
      library,
      sessionType: slot.session_type,
      blockType: "mobility",
      variant,
    });
    if (mob) blocks.push(render(mob, profile, order++, { division: profile.division }));
  }

  return blocks;
}
