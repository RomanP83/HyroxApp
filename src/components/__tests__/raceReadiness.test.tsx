import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RaceReadiness } from "../RaceReadiness";
import { RaceResultsCard } from "../RaceResultsCard";
import { analyseRaces, type RaceResult } from "@/lib/engine";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => "/progress",
}));

const baseline: RaceResult = {
  id: "b",
  kind: "race",
  held_on: "2026-03-14",
  label: "Rome",
  is_baseline: true,
  total_sec: 5095,
  runs_sec: [255, 262, 265, 268, 290, 272, 270, 261],
  stations_sec: [270, 230, 330, 420, 290, 120, 330, 587],
  roxzone_sec: 375,
};
const sim: RaceResult = {
  ...baseline,
  id: "s",
  kind: "simulation",
  held_on: "2026-10-01",
  label: null,
  is_baseline: false,
  total_sec: 4700,
  runs_sec: [250, 255, 255, 260, 275, 262, 260, 255],
  stations_sec: [260, 210, 300, 380, 280, 110, 300, 520],
  roxzone_sec: 330,
};

describe("RaceReadiness", () => {
  it("explains what is missing when nothing is logged", () => {
    const html = renderToStaticMarkup(<RaceReadiness analysis={analyseRaces([], null)} results={[]} />);
    expect(html).toContain("Set a target time");
    expect(html).toContain("Log a full simulation");
    expect(html).not.toContain("<table");
  });

  it("shows the segment table, readiness and the BBJ signal", () => {
    const results = [baseline, sim];
    const html = renderToStaticMarkup(<RaceReadiness analysis={analyseRaces(results, 4200)} results={results} />);
    expect(html).toContain("Race readiness");
    expect(html).toContain("<table");
    expect(html).toContain("Burpee Broad Jumps");
    expect(html).toContain("Pace lost after the burpee broad jumps");
    expect(html).toContain("(Rome)");
    expect(html).toMatch(/\d+%/);
  });
});

describe("RaceResultsCard", () => {
  it("lists results with the baseline marked and offers the form", () => {
    const html = renderToStaticMarkup(
      <RaceResultsCard results={[baseline, sim]} targetTimeSec={4199} onToast={() => undefined} onSaved={() => undefined} />,
    );
    expect(html).toContain('data-testid="race-results-card"');
    expect(html).toContain("target 1:09:59");
    expect(html).toContain(">baseline<");
    expect(html).toContain("Make baseline");
    expect(html).toContain("Run 8");
    expect(html).toContain("Wall Balls");
  });
});
