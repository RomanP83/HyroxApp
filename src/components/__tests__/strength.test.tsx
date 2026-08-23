import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionCard, type StrengthExerciseInput } from "../SessionCard";
import { StrengthClient, type StrengthTemplate } from "../StrengthClient";
import { parseStrengthTemplate } from "@/lib/strength/parse";
import type { GeneratedSession } from "@/lib/engine";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => "/strength",
}));

const SHEET = [
  "\tTag A: Oberkörper\tSätze\tWiederholungen\tGewicht\tSatz 1\tSatz 2",
  "1\tBankdrücken mit KH\t2\t6 - 8\t22\t12\t8",
  "6\tHammer curls mit KH im Supersatz\t2\t10 - 12\t16\t10\t10",
  "7\tFace Pulls (am Kabelzug) im Supersatz\t2\t12 - 15\t27\t12\t12",
  "\tDips\t\t\t\t15\t15",
].join("\n");

/** The parsed sheet, shaped the way the plan page hands it to the card. */
const EXERCISES: StrengthExerciseInput[] = parseStrengthTemplate(SHEET).exercises.map((e, i) => ({
  id: `ex-${i}`,
  name: e.name,
  sets: e.sets,
  rep_min: e.rep_min,
  rep_max: e.rep_max,
  load_kg: e.load_kg,
  superset_group: e.superset_group,
}));

const SESSION: GeneratedSession = {
  day_hint: 2,
  day_slot: "am",
  session_type: "strength",
  title: "Strength",
  planned_duration_min: 60,
  intensity_rpe_target: 7,
  sort_order: 0,
  blocks: [],
};

describe("SessionCard with a personal strength day", () => {
  const html = renderToStaticMarkup(
    <SessionCard
      session={SESSION}
      onLog={() => undefined}
      strength={{ templateName: "Tag A: Oberkörper", exercises: EXERCISES }}
    />,
  );

  it("names the day and lists every exercise", () => {
    expect(html).toContain("Tag A: Oberkörper");
    for (const e of EXERCISES) expect(html).toContain(e.name);
  });

  it("gives every planned set its own reps and weight field", () => {
    const totalSets = EXERCISES.reduce((n, e) => n + e.sets, 0);
    const repInputs = html.match(/set \d+ reps/g) ?? [];
    const loadInputs = html.match(/set \d+ weight/g) ?? [];
    expect(repInputs).toHaveLength(totalSets);
    expect(loadInputs).toHaveLength(totalSets);
  });

  it("prefills the programmed numbers as placeholders, not as values", () => {
    // Bench: 6-8 reps at 22 kg -> the top of the range and the load are hints.
    expect(html).toContain('placeholder="8"');
    expect(html).toContain('placeholder="22"');
    // Dips are bodyweight.
    expect(html).toContain('placeholder="BW"');
    expect(html).not.toContain('value="22"');
  });

  it("shows the rep range, the load and the superset pairing", () => {
    expect(html).toContain("6–8");
    expect(html).toContain("22 kg");
    expect(html).toContain("bodyweight");
    expect((html.match(/SS A/g) ?? []).length).toBe(2);
  });

  it("says the plan will not change a weight on its own", () => {
    expect(html).toContain("never changes it on its own");
  });

  it("stays a plain card when the athlete has no strength day", () => {
    const plain = renderToStaticMarkup(<SessionCard session={SESSION} onLog={() => undefined} />);
    expect(plain).not.toContain("set 1 reps");
    expect(plain).toContain("Felt harder");
  });
});

describe("StrengthClient", () => {
  const template: StrengthTemplate = {
    id: "t1",
    name: "Tag A: Oberkörper",
    sort_order: 0,
    strength_exercises: EXERCISES.map((e, i) => ({
      ...e,
      position: i,
      suggested_load_kg: e.name === "Bankdrücken mit KH" ? 24.5 : null,
      suggested_reason:
        e.name === "Bankdrücken mit KH" ? "Every set hit 8 reps at 22 kg — 24.5 kg is the next step." : null,
    })),
  };
  const html = renderToStaticMarkup(<StrengthClient templates={[template]} />);

  it("carries the shared header — the way back to the week view", () => {
    expect(html).toMatch(/<a[^>]+href="\/plan"[^>]*>Hyrox/);
  });

  it("puts an open suggestion up front, with both answers", () => {
    expect(html).toContain("Ready to go up");
    expect(html).toContain("22 kg → 24.5 kg");
    expect(html).toContain("Take it");
    expect(html).toContain("Keep 22 kg");
  });

  it("lists the day with its exercises and editable weights", () => {
    expect(html).toContain("Tag A: Oberkörper");
    expect(html).toContain("Weight for Bankdrücken mit KH");
    expect(html).toContain("SS A");
  });

  it("offers the import box when nothing is there yet", () => {
    const empty = renderToStaticMarkup(<StrengthClient templates={[]} />);
    expect(empty).toContain("Import a day from Excel");
    expect(empty).toContain("No strength day yet");
  });
});
