import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BenchmarksClient, type BenchmarkDef } from "../BenchmarksClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => "/benchmarks",
}));

const defs: BenchmarkDef[] = [
  { id: "a", slug: "atpt_recovery", name: "AT-PT · recovery time", metric_type: "time_sec", protocol: null },
  { id: "b", slug: "atpt_watts", name: "AT-PT · watts at threshold HR", metric_type: "watts", protocol: null },
  { id: "c", slug: "run_1k", name: "1 km Time Trial", metric_type: "time_sec", protocol: null },
];

const render = (hrMax: number | null, entries = [] as Parameters<typeof BenchmarksClient>[0]["entries"]) =>
  renderToStaticMarkup(<BenchmarksClient defs={defs} entries={entries} predicted={null} hrMax={hrMax} />);

describe("the AT-PT card", () => {
  it("turns a max heart rate of 195 into the trial's targets", () => {
    const html = render(195);
    expect(html).toContain('data-testid="atpt-card"');
    expect(html).toContain("<b>156 bpm</b>");
    expect(html).toContain("<b>167–173 bpm</b>");
    expect(html).toContain("<b>130 bpm</b>");
  });

  it("says what is missing instead of guessing targets", () => {
    const html = render(null);
    expect(html).toContain("Set your max heart rate");
    expect(html).not.toContain("bpm</b>");
  });

  it("takes both AT-PT benchmarks out of the generic grid", () => {
    const html = render(195);
    // Each AT-PT definition name appears nowhere as a grid card heading.
    expect(html).not.toContain(">AT-PT · watts at threshold HR<");
    expect(html).not.toContain(">AT-PT · recovery time<");
    expect(html).toContain(">1 km Time Trial<");
  });

  it("shows the latest result in watts and as a recovery time", () => {
    const html = render(195, [
      { benchmark_id: "b", value: 231, phase_context: "start", recorded_at: "2026-10-01" },
      { benchmark_id: "a", value: 74, phase_context: "start", recorded_at: "2026-10-01" },
    ]);
    expect(html).toContain("231 W");
    expect(html).toContain("↓ 1:14");
  });
});
