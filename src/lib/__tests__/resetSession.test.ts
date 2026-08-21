import { describe, it, expect } from "vitest";
import { replayOrder } from "../resetSession";
import { stateFromSnapshot } from "../dbTypes";
import type { AthleteState } from "@/lib/engine";

const LOGS = [
  { session_id: "a", completed_at: "2026-03-01T10:00:00.000Z" },
  { session_id: "b", completed_at: "2026-03-03T10:00:00.000Z" },
  { session_id: "c", completed_at: "2026-03-02T10:00:00.000Z" },
];

describe("replayOrder", () => {
  it("replays only the logs after the reset one, oldest first", () => {
    expect(replayOrder(LOGS, "2026-03-01T10:00:00.000Z", "a")).toEqual(["c", "b"]);
  });

  it("returns nothing when the reset day is the most recent log", () => {
    expect(replayOrder(LOGS, "2026-03-03T10:00:00.000Z", "b")).toEqual([]);
  });

  it("never replays the day being reset, even on an exact timestamp tie", () => {
    const tie = [
      { session_id: "x", completed_at: "2026-03-05T08:00:00.000Z" },
      { session_id: "y", completed_at: "2026-03-05T08:00:00.000Z" },
    ];
    expect(replayOrder(tie, "2026-03-05T08:00:00.000Z", "x")).toEqual([]);
  });
});

describe("stateFromSnapshot", () => {
  const state: AthleteState = {
    acute_load_7d: 1200,
    chronic_load_28d: 900,
    acwr: 1.33,
    pace_zones: { easy_sec_km: 330, tempo_sec_km: 290, interval_sec_km: 265, race_sec_km: 300 },
    station_tiers: { wall_balls: 2, row: 1 },
    predicted_race_time_sec: 5100,
    strength_modifier: 1.05,
    pace_zones_ref: { easy_sec_km: 335, tempo_sec_km: 295, interval_sec_km: 270, race_sec_km: 305 },
    pace_ref_at: "2026-03-01T10:00:00.000Z",
  };

  it("round-trips a snapshot through jsonb", () => {
    expect(stateFromSnapshot(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("rejects logs written before snapshots existed", () => {
    expect(stateFromSnapshot(null)).toBeNull();
    expect(stateFromSnapshot({})).toBeNull();
    expect(stateFromSnapshot({ acwr: 1.1 })).toBeNull();
  });

  it("falls back to pace_zones when no weekly reference was stored", () => {
    const { pace_zones_ref: _ref, ...withoutRef } = state;
    expect(stateFromSnapshot(withoutRef)?.pace_zones_ref).toEqual(state.pace_zones);
  });
});
