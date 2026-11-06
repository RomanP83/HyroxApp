// ============================================================================
// A backup that quietly stops at row 200 looks exactly like a working backup.
// ============================================================================
import { describe, expect, it } from "vitest";
import { chunkIds, CHUNK, idsOf } from "../exportChunks";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

describe("chunking ids for a query string", () => {
  it("keeps every id, in order, across the batches", () => {
    for (const n of [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 4321]) {
      const batches = chunkIds(ids(n));
      expect(batches.flat()).toEqual(ids(n));
    }
  });

  it("never puts more than the limit in one batch", () => {
    for (const batch of chunkIds(ids(4321))) {
      expect(batch.length).toBeLessThanOrEqual(CHUNK);
      expect(batch.length).toBeGreaterThan(0);
    }
  });

  it("asks for nothing when there is nothing to ask for", () => {
    // The caller loops over the batches; an empty list must produce no query
    // at all rather than one with an empty `in (...)`.
    expect(chunkIds([])).toEqual([]);
  });
});

describe("collecting the ids to follow", () => {
  it("returns each id once", () => {
    expect(idsOf([{ id: "a" }, { id: "b" }, { id: "a" }])).toEqual(["a", "b"]);
  });

  it("drops a null foreign key instead of asking for the id \"null\"", () => {
    // plan_id on race_results is nullable; String(null) would be "null", and
    // the follow-up query would hunt for a row that cannot exist.
    expect(idsOf([{ plan_id: null }, { plan_id: "p1" }], "plan_id")).toEqual(["p1"]);
  });

  it("drops a column that is not there at all", () => {
    expect(idsOf([{ other: "x" }], "block_id")).toEqual([]);
    expect(idsOf([{ id: "" }])).toEqual([]);
  });

  it("ignores a non-string id rather than stringifying it", () => {
    expect(idsOf([{ id: 42 }, { id: "ok" }] as unknown as Record<string, unknown>[])).toEqual(["ok"]);
  });
});
