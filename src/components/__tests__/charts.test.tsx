import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BarChart, LineChart } from "../charts";

const pts = [
  { label: "W1", y: 75 },
  { label: "W2", y: 100 },
  { label: "W3", y: 50 },
];

describe("chart components", () => {
  it("LineChart renders line, ringed markers, tooltip titles, and a data table", () => {
    const html = renderToStaticMarkup(
      <LineChart series={pts} fmt={(v) => `${v}%`} />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain('stroke-width="2"'); // 2px line spec
    // markers carry the 2px surface ring
    expect(html).toContain('stroke="#141b24"');
    expect(html).toContain("<title>W1: 75%</title>");
    expect(html).toContain("Data table");
  });

  it("LineChart with two series renders a legend", () => {
    const html = renderToStaticMarkup(
      <LineChart series={pts} secondary={pts} legend={["Target", "Actual"]} />,
    );
    expect(html).toContain("Target");
    expect(html).toContain("Actual");
  });

  it("single-series LineChart renders no legend box", () => {
    const html = renderToStaticMarkup(<LineChart series={pts} />);
    expect(html).not.toContain("inline-block h-2 w-2");
  });

  it("BarChart renders one bar per point with tooltips and gridlines", () => {
    const html = renderToStaticMarkup(<BarChart bars={pts} fmt={(v) => `${v}%`} domain={[0, 100]} />);
    const bars = html.match(/<path/g) ?? [];
    expect(bars.length).toBe(3);
    expect(html).toContain("<title>W3: 50%</title>");
    expect(html).toContain('stroke="#26333f"'); // recessive 1px gridlines
  });

  it("empty series degrade to a friendly message", () => {
    expect(renderToStaticMarkup(<LineChart series={[]} />)).toContain("Not enough data");
    expect(renderToStaticMarkup(<BarChart bars={[]} />)).toContain("Not enough data");
  });
});
