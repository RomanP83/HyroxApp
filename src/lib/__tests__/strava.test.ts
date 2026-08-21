import { describe, it, expect } from "vitest";
import { paceSecPerKm, signState, verifyState } from "../strava";

describe("strava helpers", () => {
  it("derives pace in sec/km from meters + moving seconds", () => {
    // 5 km in 25:00 -> 300 sec/km
    expect(paceSecPerKm(5000, 1500)).toBe(300);
    // 8.4 km in 45:22 -> ~324 sec/km
    expect(paceSecPerKm(8400, 2722)).toBe(324);
  });

  it("rejects degenerate activities (treadmill blips, missing data)", () => {
    expect(paceSecPerKm(0, 1500)).toBeNull();
    expect(paceSecPerKm(200, 90)).toBeNull(); // < 400 m — not a run session
    expect(paceSecPerKm(5000, 0)).toBeNull();
  });

  it("OAuth state round-trips and rejects tampering", () => {
    process.env.STRAVA_CLIENT_SECRET = "test-secret";
    const state = signState("profile-123");
    expect(verifyState(state)).toBe("profile-123");
    expect(verifyState(state.slice(0, -2) + "xx")).toBeNull();
    expect(verifyState("garbage")).toBeNull();
  });
});
