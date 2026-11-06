// ============================================================================
// The two bits of the export that can silently lose data.
//
// A backup that drops everything past the two-hundredth row is worse than no
// backup, because it looks like one. Both helpers live here so they can be
// tested without a database.
// ============================================================================

/** How many ids go into one `.in()` — they all end up in the query string. */
export const CHUNK = 200;

/** Split ids into batches small enough for a URL. */
export function chunkIds(ids: string[], size = CHUNK): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/**
 * The distinct, non-null ids in a column. Rows arrive as `Record<string,
 * unknown>` straight from the driver, so a missing column reads as undefined
 * and a null foreign key stringifies to "null" — both have to go, or the query
 * that follows asks for an id that cannot exist.
 */
export function idsOf(rows: Record<string, unknown>[], key = "id"): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "string" || !value) continue;
    seen.add(value);
  }
  return [...seen];
}
