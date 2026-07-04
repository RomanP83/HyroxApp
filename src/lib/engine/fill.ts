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
import type { SessionSlot } from "./micro";

function variantFor(profile: AthleteProfile): EquipmentVariant {
  return profile.equipment_access === "home_minimal" ? "home" : "gym";
}

/** Which pace zone a session type runs at. */
function paceForSession(state: AthleteState, type: SessionType): number | undefined {
  const z = state.pace_zones;
  switch (type) {
    case "run_easy":
      return z.easy_sec_km;
    case "run_intervals":
      return z.interval_sec_km;
    case "compromised_run":
    case "full_sim":
      return z.race_sec_km;
    default:
      return undefined;
  }
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
  const rotatedStation = STATIONS[(weekNumber - 1) % STATIONS.length];
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
    blocks.push(
      render(main, profile, order++, {
        division: profile.division,
        station_tier: targetTier,
        pace_sec_km: pace,
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
