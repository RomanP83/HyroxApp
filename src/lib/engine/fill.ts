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
  RenderedBlock,
  SessionType,
  Station,
  WorkoutBlock,
} from "./types";
import { STATIONS } from "./types";
import { COMPROMISED_OPENING, compromisedOpeningPace, runSpec } from "./running";
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
): RenderedBlock[] {
  const variant = variantFor(profile);
  const blocks: RenderedBlock[] = [];
  let order = 0;

  if (slot.session_type === "rest") return blocks;
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

  // Main block.
  const main = pickBlock({
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
        note: station ? `${station} focus @ tier ${targetTier}` : undefined,
      }),
    );
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
