import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { planSeason } from "@/lib/engine";
import { SeasonClient, type SeasonData } from "../SeasonClient";

// The year view is a client component; the router is not part of what we test.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

/** Same mapping the /season server page does, so engine and UI stay in step. */
function toSeasonData(): SeasonData {
  const season = planSeason({
    startDate: "2026-10-01",
    races: [
      { date: "2027-01-16", type: "Hyrox Open", priority: "A" },
      { date: "2027-02-27", type: "Winter Throwdown", priority: "B" },
      { date: "2027-05-15", type: "Hyrox Pro", priority: "A" },
    ],
    trainingDaysPerWeek: 5,
    weaknesses: ["Sled Push", "Laktattoleranz", "Wall Balls"],
  });
  return {
    start_date: season.start_date,
    end_date: season.end_date,
    total_weeks: season.total_weeks,
    notes: season.notes,
    races: season.races.map((r) => ({
      race_date: r.date,
      race_type: r.type,
      priority: r.priority,
      week_number: r.week_number,
      is_anchor: r.is_anchor,
    })),
    blocks: season.macrocycles.flatMap((m) =>
      m.blocks.map((b) => ({
        macrocycle_sort: m.sort_order,
        macrocycle_label: m.label,
        target_race_index: m.target_race_index,
        sort_order: b.sort_order,
        kind: b.kind,
        start_week: b.start_week,
        end_week: b.end_week,
        weeks: b.weeks,
        start_date: b.start_date,
        end_date: b.end_date,
        volume_multiplier: b.volume_multiplier,
        focus: b.focus,
        key_sessions: b.key_sessions,
        weakness_targets: b.weakness_targets,
        deload_weeks: b.deload_weeks,
      })),
    ),
  };
}

const DATA = toSeasonData();

describe("SeasonClient", () => {
  const html = renderToStaticMarkup(
    <SeasonClient
      season={DATA}
      weaknesses={["Sled Push"]}
      activePlanRaceDate={null}
      currentWeek={5}
      today="2026-11-04"
    />,
  );

  it("draws one timeline segment per block, sized by its week count", () => {
    const segments = html.match(/flex-grow:\d+/g) ?? [];
    expect(segments).toHaveLength(DATA.blocks.length);
    // A 3-week block is three times the width of a 1-week block.
    for (const b of DATA.blocks) expect(html).toContain(`flex-grow:${b.weeks}`);
  });

  it("labels every macrocycle and marks each race with its priority", () => {
    expect(html).toContain("Race cycle 1 — Hyrox Open, 2027-01-16");
    expect(html).toContain("Race cycle 2 — Hyrox Pro, 2027-05-15");
    expect(html).toContain("Winter Throwdown");
    expect(html).toContain("A ·");
    expect(html).toContain("B ·");
  });

  it("marks the block the athlete is in right now", () => {
    const current = DATA.blocks.find((b) => 5 >= b.start_week && 5 <= b.end_week)!;
    expect(html).toContain(">now<");
    expect(html).toContain(current.focus);
  });

  it("shows each block's focus, key sessions, volume and weakness targets", () => {
    const base = DATA.blocks.find((b) => b.kind === "base")!;
    expect(html).toContain(base.focus);
    expect(html).toContain(base.key_sessions[0]);
    expect(html).toContain(`volume ${Math.round(base.volume_multiplier * 100)}%`);
    expect(html).toContain("Sled Push");
    expect(html).toContain("deload w");
  });

  it("explains the planner's decisions", () => {
    expect(html).toContain("How this year was planned");
    // React escapes quotes in the notes, so compare against escaped text.
    const escaped = html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
    for (const note of DATA.notes) expect(escaped).toContain(note);
  });

  it("offers the calendar editor even with no season yet", () => {
    const empty = renderToStaticMarkup(
      <SeasonClient
        season={null}
        weaknesses={[]}
        activePlanRaceDate={null}
        currentWeek={null}
        today="2026-11-04"
      />,
    );
    expect(empty).toContain("Build my year plan");
    expect(empty).toContain("No season yet");
  });
});
