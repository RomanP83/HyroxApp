import { describe, it, expect } from "vitest";
import { isGarminRun, newCodeVerifier, signGarminState, verifyGarminState } from "../garmin";

describe("garmin helpers", () => {
  it("classifies running activity types, rejects everything else", () => {
    expect(isGarminRun("RUNNING")).toBe(true);
    expect(isGarminRun("TRAIL_RUNNING")).toBe(true);
    expect(isGarminRun("TREADMILL_RUNNING")).toBe(true);
    expect(isGarminRun("running")).toBe(true);
    expect(isGarminRun("CYCLING")).toBe(false);
    expect(isGarminRun("LAP_SWIMMING")).toBe(false);
    expect(isGarminRun(undefined)).toBe(false);
  });

  it("OAuth state round-trips profile id + PKCE verifier and rejects tampering", () => {
    process.env.GARMIN_CLIENT_SECRET = "test-secret";
    const verifier = newCodeVerifier();
    const state = signGarminState("profile-abc", verifier);
    const parsed = verifyGarminState(state);
    expect(parsed).toEqual({ profileId: "profile-abc", verifier });
    expect(verifyGarminState(state.slice(0, -2) + "xx")).toBeNull();
    expect(verifyGarminState("garbage")).toBeNull();
  });
});
