import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { GeneratedSession } from "@/lib/engine";
import { SessionCard } from "../SessionCard";

const session: GeneratedSession = {
  day_hint: 2,
  day_slot: "am",
  session_type: "run_intervals",
  title: "Threshold / VO₂max Intervals",
  planned_duration_min: 55,
  intensity_rpe_target: 8,
  sort_order: 0,
  blocks: [],
};

const render = (props: Parameters<typeof SessionCard>[0]) =>
  renderToStaticMarkup(<SessionCard {...props} />);

describe("the session card", () => {
  it("marks what the day demands, in colour and in words", () => {
    const html = render({ session, onLog: () => undefined });
    expect(html).toContain("Hard");
    expect(html).toContain("#ff5a1f"); // the effort rail
    const aerobic = render({
      session: { ...session, session_type: "long_run", title: "Long Run" },
      onLog: () => undefined,
    });
    expect(aerobic).toContain("Aerobic");
    expect(aerobic).toContain("#35b88a");
  });

  it("spends the accent on one card only — the session you are standing in", () => {
    // Six filled buttons in a week is six focal points, which is none.
    expect(render({ session, onLog: () => undefined, focal: true })).toContain("btn-primary");
    expect(render({ session, onLog: () => undefined })).not.toContain("btn-primary");
  });

  it("keeps the move control out of the collapsed row", () => {
    // It lives inside the opened card: a "Move" under every collapsed session
    // is furniture in a list you scan for today. e2e/demo.spec.ts drives the
    // opened state in a browser.
    const html = render({ session, onLog: () => undefined, onMove: () => undefined });
    expect(html).not.toContain("Move this session to another day of the week");
  });

  it("never offers to move a rest day", () => {
    const html = render({
      session: { ...session, session_type: "rest", title: "Rest" },
      onMove: () => undefined,
    });
    expect(html).not.toContain("Move this session to another day of the week");
  });
});
