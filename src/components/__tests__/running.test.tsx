import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  defaultPaceZones,
  distributeSlots,
  fillSession,
  initialAthleteState,
  type AthleteProfile,
} from "@/lib/engine";
import { DEMO_LIBRARY } from "@/lib/demoLibrary";
import { SessionCard } from "../SessionCard";
import { BlockView } from "../BlockView";

const profile: AthleteProfile = {
  id: "t",
  division: "open",
  experience_level: "intermediate",
  five_k_seconds: 1350,
  station_estimates: {},
  training_days_per_week: 5,
  equipment_access: "full_gym",
};
const state = initialAthleteState(profile);

function cardFor(sessionType: string, phase: "base" | "build") {
  const slot = distributeSlots({
    phase,
    trainingDays: 5,
    weekInPhase: 1,
    isDeload: false,
    isBenchmark: false,
  }).find((s) => s.session_type === sessionType)!;
  const session = {
    day_hint: slot.day_hint,
    day_slot: slot.day_slot,
    session_type: slot.session_type,
    title: sessionType,
    planned_duration_min: slot.planned_duration_min,
    intensity_rpe_target: slot.intensity_rpe_target,
    sort_order: 0,
    blocks: fillSession(slot, profile, state, DEMO_LIBRARY, 3),
  };
  return renderToStaticMarkup(<SessionCard session={session} onLog={() => undefined} />);
}

describe("run sessions on the card", () => {
  it("puts the heart-rate zone, the pace target and the distance on a long run", () => {
    const html = cardFor("long_run", "base");
    expect(html).toContain("Zone 2 · 65-75% HRmax");
    expect(html).toContain("12-18 km");
    // The easy pace zone of a 22:30 5k athlete, as minutes per km.
    expect(html).toMatch(/\d:\d\d\/km/);
  });

  it("marks intervals as the hard session they are", () => {
    const html = cardFor("run_intervals", "base");
    expect(html).toContain("Zone 4-5 · 88-95% HRmax");
    expect(html).toContain("8-10 km total");
  });

  it("shows the compromised opening buffer before the card is even opened", () => {
    const html = cardFor("compromised_run", "build");
    expect(html).toContain("Zone 3-4 · 80-90% HRmax");
    expect(html).toContain("first 400 m:");
  });

  it("spells out the opening rule on the block itself", () => {
    const slot = distributeSlots({
      phase: "build",
      trainingDays: 5,
      weekInPhase: 1,
      isDeload: false,
      isBenchmark: false,
    }).find((s) => s.session_type === "compromised_run")!;
    const block = fillSession(slot, profile, state, DEMO_LIBRARY, 3).find(
      (b) => b.load_adjustments.opening_pace_sec_km != null,
    )!;
    const html = renderToStaticMarkup(<BlockView block={block} />);
    expect(html).toContain("First 400 m at");
    expect(html).toContain("then settle onto");
    expect(html).toContain("first 200 m are for finding your breathing");
    expect(html).toContain("never sprint out of a station");
  });

  it("leaves a strength session alone", () => {
    const html = cardFor("strength", "base");
    expect(html).not.toContain("HRmax");
  });
});
