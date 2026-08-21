import { describe, it, expect } from "vitest";
import { parseLoad, parseRepRange, parseStrengthTemplate } from "../parse";

/** The sheet as it arrives on the clipboard, tabs and all. */
const SHEET = [
  "\tTag A: Oberkörper (Fokus Kraft & Aufbau)\tSätze\tWiederholungen\tGewicht\tSatz 1\tSatz 2",
  "\t\t\t\t\t\t",
  "1\tBankdrücken mit KH\t2\t6 - 8\t22\t12\t8",
  "2\tRuderzug (Breit oder Eng)\t2\t6 - 8\t85\t10\t9",
  "3\tSchulterdrücken mit KH\t2\t8 - 10\t18\t8\t6",
  "4\tLatzug\t2\t12 - 15\t65\t12\t10",
  "5\tTrizepsdrücken über Kopf\t2\t10 - 12\t22\t10\t10",
  "6\tHammer curls mit KH im Supersatz\t2\t10 - 12\t16\t10\t10",
  "7\tFace Pulls (am Kabelzug) im Supersatz\t2\t12 - 15\t27\t12\t12",
  "\tDips\t\t\t\t15\t15",
].join("\n");

describe("parseStrengthTemplate — the real sheet", () => {
  const parsed = parseStrengthTemplate(SHEET);

  it("names the day from the header", () => {
    expect(parsed.name).toBe("Tag A: Oberkörper (Fokus Kraft & Aufbau)");
  });

  it("reads all eight exercises in order", () => {
    expect(parsed.exercises.map((e) => e.name)).toEqual([
      "Bankdrücken mit KH",
      "Ruderzug (Breit oder Eng)",
      "Schulterdrücken mit KH",
      "Latzug",
      "Trizepsdrücken über Kopf",
      "Hammer curls mit KH",
      "Face Pulls (am Kabelzug)",
      "Dips",
    ]);
    expect(parsed.exercises.map((e) => e.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps sets, rep ranges and weights", () => {
    const bench = parsed.exercises[0];
    expect(bench).toMatchObject({ sets: 2, rep_min: 6, rep_max: 8, load_kg: 22 });
    expect(parsed.exercises[3]).toMatchObject({ name: "Latzug", rep_min: 12, rep_max: 15, load_kg: 65 });
  });

  it("strips the superset marker and pairs the two rows that carry it", () => {
    const curls = parsed.exercises[5];
    const facePulls = parsed.exercises[6];
    expect(curls.superset_group).not.toBeNull();
    expect(facePulls.superset_group).toBe(curls.superset_group);
    // Everything else stands on its own.
    expect(parsed.exercises.filter((e) => e.superset_group)).toHaveLength(2);
  });

  it("handles the bodyweight row with no sets and no weight", () => {
    const dips = parsed.exercises[7];
    expect(dips.load_kg).toBeNull();
    expect(dips.sets).toBe(2); // inferred from the two logged sets
    expect(dips.last_set_reps).toEqual([15, 15]);
    expect(parsed.warnings.some((w) => w.includes("Dips") && w.includes("bodyweight"))).toBe(true);
  });

  it("keeps the logged reps per set as last-session data, not as the plan", () => {
    expect(parsed.exercises[0].last_set_reps).toEqual([12, 8]);
    expect(parsed.exercises[0].rep_max).toBe(8); // the plan is the range, not the log
  });
});

describe("parseStrengthTemplate — other shapes", () => {
  it("reads a sheet without a numbering column and with English headers", () => {
    const parsed = parseStrengthTemplate(
      ["Exercise\tSets\tReps\tWeight", "Back Squat\t3\t5\t100", "Pull-up\t3\t8 - 10\t"].join("\n"),
    );
    expect(parsed.exercises.map((e) => e.name)).toEqual(["Back Squat", "Pull-up"]);
    expect(parsed.exercises[0]).toMatchObject({ sets: 3, rep_min: 5, rep_max: 5, load_kg: 100 });
    expect(parsed.exercises[1].load_kg).toBeNull();
  });

  it("takes semicolon and comma separated text too", () => {
    const parsed = parseStrengthTemplate("Übung;Sätze;Wiederholungen;Gewicht\nKniebeuge;3;6 - 8;80");
    expect(parsed.exercises[0]).toMatchObject({ name: "Kniebeuge", sets: 3, rep_min: 6, load_kg: 80 });
  });

  it("says so instead of inventing when there is nothing to read", () => {
    expect(parseStrengthTemplate("").exercises).toEqual([]);
    expect(parseStrengthTemplate("   \n  ").warnings.length).toBeGreaterThan(0);
  });
});

describe("cell parsing", () => {
  it("reads weights the way a sheet writes them", () => {
    expect(parseLoad("22")).toBe(22);
    expect(parseLoad("22,5")).toBe(22.5);
    expect(parseLoad("22.5 kg")).toBe(22.5);
    expect(parseLoad("2x16")).toBe(16); // dumbbells: per hand
    expect(parseLoad("")).toBeNull();
    expect(parseLoad("Körpergewicht")).toBeNull();
  });

  it("reads rep ranges the way a sheet writes them", () => {
    expect(parseRepRange("6 - 8")).toEqual([6, 8]);
    expect(parseRepRange("6-8")).toEqual([6, 8]);
    expect(parseRepRange("6 – 8")).toEqual([6, 8]);
    expect(parseRepRange("12")).toEqual([12, 12]);
    expect(parseRepRange("8 - 6")).toEqual([6, 8]);
    expect(parseRepRange("AMRAP")).toEqual([null, null]);
  });
});
