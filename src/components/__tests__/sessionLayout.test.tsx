import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { GeneratedSession, RenderedBlock } from "@/lib/engine";
import { BlockView, stepCount } from "../BlockView";
import { EffortPicker, effortConsequence, RPE_SCALE } from "../EffortPicker";
import { SessionCard, type StrengthExerciseInput } from "../SessionCard";

const block = (block_type: RenderedBlock["block_type"], n: number, sort_order: number): RenderedBlock => ({
  block_id: `b-${block_type}`,
  block_type,
  station: null,
  sort_order,
  content: Array.from({ length: n }, (_, i) => ({ exercise: `${block_type} ${i + 1}`, reps: 10 })),
  load_adjustments: { division: "open" },
});

describe("BlockView as a numbered section", () => {
  it("labels the section and numbers its steps from startAt", () => {
    const html = renderToStaticMarkup(<BlockView block={block("main", 3, 1)} startAt={4} />);
    expect(html).toContain("Main set");
    expect(html).toContain(">4<");
    expect(html).toContain(">6<");
    expect(html).not.toContain(">7<");
  });

  it("counts a block's steps for the next block's numbering", () => {
    expect(stepCount(block("warmup", 2, 0))).toBe(2);
  });

  it("numbers a whole session 1…n across its blocks", () => {
    const session: GeneratedSession = {
      day_hint: 1,
      day_slot: "am",
      session_type: "station_work",
      title: "Stations",
      planned_duration_min: 50,
      intensity_rpe_target: 6,
      sort_order: 0,
      blocks: [block("warmup", 2, 0), block("main", 2, 1), block("finisher", 1, 2)],
    };
    const html = renderToStaticMarkup(<SessionCard session={session} defaultOpen />);
    expect(html).toContain("Warm-up");
    expect(html).toContain("Finisher");
    // The finisher's single step is the fifth of the session.
    const finisher = html.slice(html.indexOf('data-block-type="finisher"'));
    expect(finisher).toContain(">5<");
  });
});

describe("the effort scale", () => {
  it("names every number from 1 to 10", () => {
    for (let n = 1; n <= 10; n++) expect(RPE_SCALE[n].label).toBeTruthy();
  });

  it("says what the engine does with the number before it is saved", () => {
    expect(effortConsequence(9, 7)).toContain("backs this kind of session off");
    expect(effortConsequence(5, 7)).toContain("twice in a row");
    expect(effortConsequence(8, 7)).toContain("holds its course");
    expect(effortConsequence(7, 7)).toContain("Right on the target");
  });

  it("renders the picked number, its label and an accessible control", () => {
    const html = renderToStaticMarkup(
      <EffortPicker value={9} target={7} onChange={() => undefined} onSave={() => undefined} onCancel={() => undefined} />,
    );
    expect(html).toContain("How hard was it?");
    expect(html).toContain(RPE_SCALE[9].label);
    expect(html).toContain('type="range"');
    expect(html).toContain("Save effort");
  });

  it("is not open until harder or easier is tapped", () => {
    const session: GeneratedSession = {
      day_hint: 1,
      day_slot: "am",
      session_type: "run_easy",
      title: "Easy run",
      planned_duration_min: 40,
      intensity_rpe_target: 4,
      sort_order: 0,
      blocks: [],
    };
    const html = renderToStaticMarkup(<SessionCard session={session} onLog={() => undefined} />);
    expect(html).toContain("Felt harder");
    expect(html).not.toContain("data-effort-picker");
  });
});

describe("the strength set table", () => {
  const exercises: StrengthExerciseInput[] = [
    {
      id: "ex-1",
      name: "Bench",
      sets: 2,
      rep_min: 6,
      rep_max: 8,
      load_kg: 22,
      superset_group: null,
      previous: [
        { set_number: 1, reps: 8, load_kg: 20 },
        { set_number: 2, reps: 7, load_kg: 20 },
      ],
    },
    { id: "ex-2", name: "Dips", sets: 1, rep_min: 15, rep_max: 15, load_kg: null, superset_group: null },
  ];
  const session: GeneratedSession = {
    day_hint: 2,
    day_slot: "am",
    session_type: "strength",
    title: "Strength",
    planned_duration_min: 60,
    intensity_rpe_target: 7,
    sort_order: 0,
    blocks: [],
  };
  const html = renderToStaticMarkup(
    <SessionCard
      session={session}
      onLog={() => undefined}
      defaultOpen
      strength={{ templateName: "Tag A", exercises }}
    />,
  );

  it("has the set, previous, kg, reps and done columns", () => {
    for (const col of ["Set", "Previous", "kg", "Reps"]) expect(html).toContain(`>${col}<`);
  });

  it("shows what was lifted last time, set by set", () => {
    expect(html).toContain("20×8");
    expect(html).toContain("20×7");
  });

  it("shows a dash where an exercise was never logged", () => {
    const dips = html.slice(html.indexOf('data-strength-exercise="Dips"'));
    expect(dips).toContain(">—<");
  });

  it("gives every set a done check", () => {
    expect(html.match(/set \d+ done/g) ?? []).toHaveLength(3);
    expect(html).toContain('aria-pressed="false"');
  });
});
