import { describe, it, expect } from "vitest";
import { loadIncrement, suggestForTemplate, suggestLoad, type ExercisePlan } from "../progression";

const bench: ExercisePlan = { name: "Bankdrücken mit KH", sets: 2, rep_min: 6, rep_max: 8, load_kg: 22 };
const sets = (...reps: number[]) =>
  reps.map((r, i) => ({ set_number: i + 1, reps: r, load_kg: 22 }));

describe("suggestLoad", () => {
  it("suggests the next weight once every set clears the top of the range", () => {
    const s = suggestLoad(bench, [sets(8, 8)]);
    expect(s?.load_kg).toBe(24.5); // 22 + 2.5
    expect(s?.reason).toContain("8 reps at 22 kg");
  });

  it("holds when only one set cleared the top", () => {
    expect(suggestLoad(bench, [sets(8, 7)])).toBeNull();
    // The sheet's own example: 12 and 8 reps — the second set is at the top,
    // the first was done lighter or easier. Not a clean double progression.
    expect(suggestLoad(bench, [sets(12, 6)])).toBeNull();
  });

  it("only comes down after two sessions under the range, never after one", () => {
    expect(suggestLoad(bench, [sets(5, 5)])).toBeNull();
    const s = suggestLoad(bench, [sets(5, 5), sets(5, 6)]);
    expect(s?.load_kg).toBe(21);
    expect(s?.reason).toContain("two sessions");
  });

  it("ignores a session that was not done at the planned load", () => {
    const lighter = [{ set_number: 1, reps: 10, load_kg: 18 }, { set_number: 2, reps: 10, load_kg: 18 }];
    expect(suggestLoad(bench, [lighter])).toBeNull();
  });

  it("stays out of bodyweight and open-ended work", () => {
    expect(suggestLoad({ ...bench, name: "Dips", load_kg: null }, [sets(15, 15)])).toBeNull();
    expect(suggestLoad({ ...bench, rep_max: null }, [sets(8, 8)])).toBeNull();
  });

  it("needs a logged session at all", () => {
    expect(suggestLoad(bench, [])).toBeNull();
    expect(suggestLoad(bench, [[]])).toBeNull();
  });

  it("wants every planned set logged before it steps up", () => {
    expect(suggestLoad({ ...bench, sets: 3 }, [sets(8, 8)])).toBeNull();
  });
});

describe("loadIncrement", () => {
  it("scales with what is on the bar", () => {
    expect(loadIncrement(16)).toBe(1); // dumbbells
    expect(loadIncrement(22)).toBe(2.5);
    expect(loadIncrement(85)).toBe(5); // loaded row / rack work
  });
});

describe("suggestForTemplate", () => {
  it("returns only the exercises that earned a change", () => {
    const rows: ExercisePlan[] = [
      bench,
      { name: "Latzug", sets: 2, rep_min: 12, rep_max: 15, load_kg: 65 },
      { name: "Dips", sets: 2, rep_min: null, rep_max: null, load_kg: null },
    ];
    const out = suggestForTemplate(rows, {
      "Bankdrücken mit KH": [sets(8, 8)],
      Latzug: [[{ set_number: 1, reps: 12, load_kg: 65 }, { set_number: 2, reps: 10, load_kg: 65 }]],
    });
    expect(Object.keys(out)).toEqual(["Bankdrücken mit KH"]);
    expect(out["Bankdrücken mit KH"].load_kg).toBe(24.5);
  });
});
