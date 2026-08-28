// ============================================================================
// Putting the athlete's own strength day where the library's block stood.
//
// The plan tree stays as generated — nothing is written. This is how a strength
// session is SHOWN once someone has imported their own programme: the library's
// main block steps aside, their exercises take its place, and the warm-up,
// finisher and mobility the engine wrapped around it stay wrapped around it.
//
// "In its place" is the whole point, and it is what went wrong: the personal
// block was appended to the end of the list instead, which left the finisher
// sitting directly after the warm-up and the actual work last. A finisher is
// named for when it happens.
// ============================================================================
import type { RenderedBlock } from "@/lib/engine";

/**
 * Swap the library's main block for the athlete's own, keeping the order the
 * engine gave the session.
 *
 * The replacement inherits the position of the block it replaces rather than a
 * fixed one: the engine decides what a session is built from, and a hard-coded
 * index only stays right until it doesn't.
 */
export function withPersonalStrengthDay(
  blocks: RenderedBlock[],
  personal: Omit<RenderedBlock, "sort_order">,
): RenderedBlock[] {
  const replaced = blocks.find((b) => b.block_type === "main");
  const rest = blocks
    .filter((b) => b.block_type !== "main")
    .sort((a, b) => a.sort_order - b.sort_order);

  let at: number;
  let sortOrder: number;
  if (replaced) {
    // The replacement inherits the position of the block it replaces rather
    // than a fixed index: the engine decides what a session is built from, and
    // a hard-coded 1 only stays right until a session is shaped differently.
    sortOrder = replaced.sort_order;
    at = rest.findIndex((b) => b.sort_order > sortOrder);
    if (at < 0) at = rest.length;
  } else {
    // Nothing to replace — an oddly shaped session. The work still belongs
    // ahead of whatever closes the session out, never after it.
    at = rest.findIndex((b) => b.block_type === "finisher" || b.block_type === "mobility");
    if (at < 0) at = rest.length;
    const before = at > 0 ? rest[at - 1].sort_order : -1;
    const after = at < rest.length ? rest[at].sort_order : before + 2;
    sortOrder = (before + after) / 2;
  }

  const out = [...rest];
  out.splice(at, 0, { ...personal, sort_order: sortOrder });
  return out;
}
