import { describe, expect, it } from "vitest";
import { localWallTimeToIso } from "@/lib/garminLoad";

describe("localWallTimeToIso", () => {
  it("reads the watch's wall time in the training time zone, across DST", () => {
    expect(localWallTimeToIso("2026-11-07T16:06:47", "Europe/Berlin")).toBe("2026-11-07T15:06:47.000Z"); // CET
    expect(localWallTimeToIso("2026-07-10 07:30:00", "Europe/Berlin")).toBe("2026-07-10T05:30:00.000Z"); // CEST
    expect(localWallTimeToIso("2026-03-29T12:00:00", "Europe/Berlin")).toBe("2026-03-29T10:00:00.000Z"); // DST day
  });
});
