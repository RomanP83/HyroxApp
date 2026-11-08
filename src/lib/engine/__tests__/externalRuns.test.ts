import { describe, expect, it } from "vitest";
import { estimateRunRpe, unplannedRunLoad, unplannedRuns, type ExternalRun } from "../externalRuns";
import { EXTERNAL_RUN_DEFAULT_RPE } from "../constants";

const run = (date: string, min: number, hr: number | null, matched = false): ExternalRun => ({
  at: `${date}T08:00:00.000Z`,
  date,
  duration_min: min,
  distance_km: min / 5,
  avg_hr: hr,
  matched,
});

describe("estimateRunRpe", () => {
  it("maps heart-rate share to the five-zone RPE bands", () => {
    expect(estimateRunRpe(120, 190)).toBe(3); // 63 %
    expect(estimateRunRpe(140, 190)).toBe(4); // 74 %
    expect(estimateRunRpe(155, 190)).toBe(5); // 82 %
    expect(estimateRunRpe(167, 190)).toBe(6); // 88 %
    expect(estimateRunRpe(174, 190)).toBe(7); // 92 %
    expect(estimateRunRpe(185, 190)).toBe(8); // 97 %
  });

  it("falls back to an easy run without heart rate or a trusted max", () => {
    expect(estimateRunRpe(null, 190)).toBe(EXTERNAL_RUN_DEFAULT_RPE);
    expect(estimateRunRpe(150, null)).toBe(EXTERNAL_RUN_DEFAULT_RPE);
    expect(estimateRunRpe(150, 150)).toBe(EXTERNAL_RUN_DEFAULT_RPE);
  });
});

describe("unplannedRuns", () => {
  it("leaves out matched runs and the twin of a run logged by hand", () => {
    const runs = [
      run("2026-11-02", 40, 140, true), // logged against its session
      run("2026-11-03", 30, 140), // logged by hand as 32 min → same run
      run("2026-11-05", 60, 155), // nothing logged → unplanned
    ];
    const out = unplannedRuns(runs, [{ date: "2026-11-03", duration_min: 32 }], 190);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: "2026-11-05", rpe_estimated: 5, srpe: 300 });
    expect(unplannedRunLoad(out)).toEqual([{ at: "2026-11-05T08:00:00.000Z", srpe: 300 }]);
  });

  it("does not treat a run of very different length as the logged one", () => {
    const out = unplannedRuns([run("2026-11-03", 90, null)], [{ date: "2026-11-03", duration_min: 30 }], null);
    expect(out).toHaveLength(1);
    expect(out[0].srpe).toBe(90 * EXTERNAL_RUN_DEFAULT_RPE);
  });

  it("lets one logged run stand in for one watch run only", () => {
    const out = unplannedRuns(
      [run("2026-11-03", 30, null), { ...run("2026-11-03", 31, null), at: "2026-11-03T18:00:00.000Z" }],
      [{ date: "2026-11-03", duration_min: 30 }],
      null,
    );
    expect(out).toHaveLength(1);
    expect(out[0].at).toBe("2026-11-03T18:00:00.000Z");
  });
});
