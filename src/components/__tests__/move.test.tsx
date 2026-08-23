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

describe("moving a session to another day", () => {
  it("offers the control whenever the caller can handle a move", () => {
    const html = render({ session, onLog: () => undefined, onMove: () => undefined });
    expect(html).toContain("Doesn&#x27;t fit today?");
    expect(html).toContain("Move this session to another day of the week");
  });

  it("stays out of the way when moving is not on offer — a locked week", () => {
    const html = render({ session, locked: true });
    expect(html).not.toContain("Doesn&#x27;t fit today?");
  });

  it("never offers to move a rest day", () => {
    const html = render({
      session: { ...session, session_type: "rest", title: "Rest" },
      onMove: () => undefined,
    });
    expect(html).not.toContain("Doesn&#x27;t fit today?");
  });

  // The day grid and the swap wording only exist once the panel is open, which
  // static markup cannot reach — e2e/demo.spec.ts drives that in a browser.
});
