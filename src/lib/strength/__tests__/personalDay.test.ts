// ============================================================================
// The reported bug: on a strength day with an imported programme, the finisher
// showed up directly after the warm-up and the actual work came last. The
// personal block was appended to the list instead of taking the place of the
// block it replaces.
// ============================================================================
import { describe, expect, it } from "vitest";
import { withPersonalStrengthDay } from "../personalDay";
import type { RenderedBlock } from "@/lib/engine";

const block = (type: RenderedBlock["block_type"], sort: number): RenderedBlock => ({
  block_id: `${type}-${sort}`,
  block_type: type,
  station: null,
  content: [],
  sort_order: sort,
  load_adjustments: { division: "open" },
});

const personal = {
  block_id: "template",
  slug: "personal_strength_day",
  block_type: "main" as const,
  station: null,
  content: [{ exercise: "Back squat" }],
  load_adjustments: { division: "open" as const },
};

// What the engine builds for a strength day.
const generated = () => [
  block("warmup", 0),
  block("main", 1),
  block("finisher", 2),
  block("mobility", 3),
];

describe("swapping in the athlete's own strength day", () => {
  it("puts it where the library block was, not at the end", () => {
    const out = withPersonalStrengthDay(generated(), personal);
    expect(out.map((b) => b.block_type)).toEqual(["warmup", "main", "finisher", "mobility"]);
    expect(out[1].block_id).toBe("template");
  });

  it("never leaves the finisher ahead of the work it finishes", () => {
    const out = withPersonalStrengthDay(generated(), personal);
    const main = out.findIndex((b) => b.block_type === "main");
    const finisher = out.findIndex((b) => b.block_type === "finisher");
    expect(main).toBeLessThan(finisher);
  });

  it("inherits the replaced block's position rather than a fixed one", () => {
    // The engine decides what a session is built from; a hard-coded index only
    // stays right until a session is shaped differently.
    const odd = [block("warmup", 0), block("warmup", 1), block("main", 2), block("finisher", 3)];
    const out = withPersonalStrengthDay(odd, personal);
    expect(out[2].block_id).toBe("template");
    expect(out.map((b) => b.sort_order)).toEqual([0, 1, 2, 3]);
  });

  it("drops the library's main block instead of showing both", () => {
    const out = withPersonalStrengthDay(generated(), personal);
    expect(out.filter((b) => b.block_type === "main")).toHaveLength(1);
    expect(out).toHaveLength(4);
  });

  it("still lands before the finisher when there was no main block to replace", () => {
    const out = withPersonalStrengthDay([block("warmup", 0), block("finisher", 2)], personal);
    const main = out.findIndex((b) => b.block_type === "main");
    const finisher = out.findIndex((b) => b.block_type === "finisher");
    expect(main).toBeGreaterThanOrEqual(0);
    expect(main).toBeLessThan(finisher);
  });

  it("returns the sorted order even when the input arrives shuffled", () => {
    const shuffled = [block("mobility", 3), block("main", 1), block("finisher", 2), block("warmup", 0)];
    const out = withPersonalStrengthDay(shuffled, personal);
    expect(out.map((b) => b.block_type)).toEqual(["warmup", "main", "finisher", "mobility"]);
  });
});
