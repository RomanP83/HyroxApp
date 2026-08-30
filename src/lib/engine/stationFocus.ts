// ============================================================================
// Which station a week goes after, inside what the phase can actually serve.
//
// Nothing used to decide this. The weekly rotation named a station that the
// catalogue session then ignored — 59 of the 60 station sessions name their own
// — so what got trained was whatever the catalogue happened to hold. Measured
// over sixteen weeks with every tier equal: between three and ten sessions per
// station, a threefold spread nobody asked for.
//
// The fix is not an even split. An even split says the farmers carry deserves
// as many weeks as the wall balls, and the race says otherwise: stationCosts()
// knows what each station costs this athlete in seconds. Training time goes
// where the seconds are.
//
// With a floor, because a station trained zero times decays, and the cost is
// only an estimate until a race is logged. And with a ceiling, because one
// expensive station given free rein takes the whole cycle: with a single
// station costing anything, an uncapped apportionment handed it nine of
// sixteen weeks.
//
// The hard limit is content, not arithmetic. Each level-and-phase pool holds
// three sessions covering three of the eight stations, so a phase can only ever
// weight the stations it actually trains. That is why this works on the pool it
// is given rather than on all eight.
// ============================================================================

import type { Station } from "./types";

/** Weeks every station in the pool is guaranteed before cost has any say. */
export const MIN_WEEKS_PER_STATION = 1;

/** At most twice the even share, so one costly station cannot eat the phase. */
export function capFor(seats: number, stations: number): number {
  if (stations <= 0) return 0;
  return Math.max(MIN_WEEKS_PER_STATION + 1, Math.ceil((2 * seats) / stations));
}

/**
 * Hand `seats` weeks to `stations`, weighted by what each costs.
 *
 * Sainte-Laguë, the same method the weekly session mix uses: each seat goes to
 * the station furthest behind its share, so rounding error does not pile up on
 * one of them. With every cost equal — a fresh athlete, or one whose stations
 * all sit at the top tier — it degenerates to a round robin, which is the right
 * answer when nothing distinguishes them.
 *
 * The returned array is in week order and avoids putting a station in two
 * consecutive weeks: two weeks of wall balls back to back is one block of wall
 * balls, not two exposures.
 */
export function weightedStationOrder(
  stations: Station[],
  costs: Partial<Record<Station, number>>,
  seats: number,
): Station[] {
  const pool = [...stations];
  const total = Math.max(0, Math.floor(seats));
  if (!pool.length || total === 0) return [];

  const cost = (s: Station) => Math.max(0, costs[s] ?? 0);
  const anyCost = pool.some((s) => cost(s) > 0);
  const cap = capFor(total, pool.length);
  const given: Record<string, number> = Object.fromEntries(pool.map((s) => [s, 0]));
  let left = total;

  // 1) The floor, as far as it reaches. Too few weeks for everyone's minimum:
  //    the expensive stations get it, which is the same rule as below applied
  //    earlier rather than a different one.
  for (const station of [...pool].sort((a, b) => cost(b) - cost(a) || pool.indexOf(a) - pool.indexOf(b))) {
    if (left <= 0) break;
    given[station] += 1;
    left -= 1;
  }

  // 2) The rest, by cost, up to the ceiling.
  while (left > 0) {
    let best: Station | null = null;
    let bestQuotient = -Infinity;
    for (const station of pool) {
      if (given[station] >= cap) continue;
      const weight = anyCost ? cost(station) : 1;
      const quotient = weight / (2 * given[station] + 1);
      if (quotient > bestQuotient) {
        bestQuotient = quotient;
        best = station;
      }
    }
    // Everything is at its ceiling: the remaining weeks go round evenly rather
    // than being dropped.
    if (!best) {
      best = pool.reduce((a, b) => (given[a] <= given[b] ? a : b));
    }
    given[best] += 1;
    left -= 1;
  }

  return spread(pool, given);
}

/** Lay the seats out so a station does not land in two weeks running. */
function spread(pool: Station[], given: Record<string, number>): Station[] {
  const left = { ...given };
  const out: Station[] = [];
  const total = pool.reduce((n, s) => n + left[s], 0);

  for (let i = 0; i < total; i++) {
    let best: Station | null = null;
    for (const station of pool) {
      if (left[station] <= 0) continue;
      // Only skip the repeat while something else could still take the slot.
      if (station === out[out.length - 1] && total - i > left[station]) continue;
      if (best == null || left[station] > left[best]) best = station;
    }
    if (best == null) best = pool.find((s) => left[s] > 0)!;
    left[best] -= 1;
    out.push(best);
  }
  return out;
}
