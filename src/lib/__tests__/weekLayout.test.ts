// ============================================================================
// A rest day is a decision the plan made, so it has to be visible as one. The
// week used to render only the days that carry work, which left an athlete
// counting backwards to tell a day off from a session already logged away.
// ============================================================================
import { describe, expect, it } from "vitest";
import { weekItemsOf, type WeekItem } from "../weekLayout";

const on = (day: number, slot?: "am" | "pm"): Row => ({
  id: `${day}${slot ?? ""}`,
  session: { day_hint: day, day_slot: slot ?? null },
});

type Row = { id: string; session: { day_hint: number; day_slot: "am" | "pm" | null } };

const shape = (items: WeekItem<Row>[]) =>
  items.map((i) => (i.kind === "rest" ? `rest${i.day}` : i.cs.id));

describe("laying a training week out as seven days", () => {
  it("fills every empty day with a rest marker", () => {
    // Mon, Wed, Thu, Sat, Sun train; Tue and Fri do not.
    const out = weekItemsOf([on(1), on(3), on(4), on(6), on(7)]);
    expect(shape(out)).toEqual(["1", "rest2", "3", "4", "rest5", "6", "7"]);
  });

  it("always accounts for all seven days", () => {
    for (const days of [[1], [2, 5], [1, 2, 3, 4, 5, 6, 7], []]) {
      const out = weekItemsOf(days.map((d) => on(d)));
      const covered = new Set(
        out.map((i) => (i.kind === "rest" ? i.day : i.cs.session.day_hint)),
      );
      expect(covered.size).toBe(7);
    }
  });

  it("calls a week with nothing in it seven rest days, not an empty list", () => {
    expect(shape(weekItemsOf([]))).toEqual([
      "rest1", "rest2", "rest3", "rest4", "rest5", "rest6", "rest7",
    ]);
  });

  it("keeps a double day together, morning first", () => {
    const out = weekItemsOf([on(2, "pm"), on(2, "am")]);
    expect(shape(out).slice(0, 3)).toEqual(["rest1", "2am", "2pm"]);
    // And a day carrying two sessions is not also a rest day.
    expect(out.filter((i) => i.kind === "rest" && i.day === 2)).toHaveLength(0);
  });

  it("reads Monday to Sunday even after a session was moved", () => {
    // Moving a session rewrites its day, never its sort_order — so the input
    // arrives in the old order and the week must not.
    const out = weekItemsOf([on(1), on(6), on(3)]);
    expect(shape(out)).toEqual(["1", "rest2", "3", "rest4", "rest5", "6", "rest7"]);
  });
});
