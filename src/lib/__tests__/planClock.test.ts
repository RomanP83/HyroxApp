import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateInTrainingZone, planWeekDates, planWeekNumber, syncPlanWeekStatuses } from "../planClock";
import { fmtCalendarDate } from "../format";

describe("plan clock", () => {
  it("dates the selected week from Monday through Sunday across year boundaries", () => {
    expect(planWeekDates("2026-12-30", 1)).toEqual([
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31",
      "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
    expect(planWeekDates("2026-12-30", 2)[0]).toBe("2027-01-04");
    expect(fmtCalendarDate("2027-01-04")).toBe("04.01.2027");
  });

  it("dates weeks consistently at timezone and daylight-saving boundaries", () => {
    expect(planWeekDates("2026-09-06T22:30:00Z", 1)[0]).toBe("2026-09-07");
    const dates = planWeekDates("2026-03-25", 1);
    expect(dates[0]).toBe("2026-03-23");
    expect(dates[6]).toBe("2026-03-29");
    expect(planWeekDates("2026-03-25", 2)[0]).toBe("2026-03-30");
  });

  it("marks all weeks complete after the cycle and signals cron callers to stop", async () => {
    const operations: unknown[][] = [];
    const chain = {
      update: (value: unknown) => { operations.push(["update", value]); return chain; },
      eq: (key: string, value: unknown) => { operations.push(["eq", key, value]); return chain; },
      lt: (key: string, value: unknown) => { operations.push(["lt", key, value]); return chain; },
      gt: () => chain,
      neq: () => Promise.resolve({ error: null }),
    };
    const db = { from: () => chain } as unknown as SupabaseClient;
    const current = await syncPlanWeekStatuses(db,
      { id: "p", generated_at: "2026-08-17T12:00:00Z", total_weeks: 2 }, "2026-08-31");
    expect(current).toBe(3);
    expect(operations).toContainEqual(["lt", "week_number", 3]);
    expect(operations).toContainEqual(["eq", "week_number", 3]);
  });

  it("advances on Monday and clamps to the plan", () => {
    expect(planWeekNumber("2026-08-19T12:00:00Z", 12, "2026-08-23")).toBe(1);
    expect(planWeekNumber("2026-08-19T12:00:00Z", 12, "2026-08-24")).toBe(2);
    expect(planWeekNumber("2026-08-19T12:00:00Z", 12, "2027-01-01")).toBe(12);
  });

  it("uses the configured training timezone rather than UTC", () => {
    const instant = new Date("2026-09-06T22:30:00.000Z");
    expect(dateInTrainingZone(instant, "Europe/Berlin")).toBe("2026-09-07");
    expect(dateInTrainingZone(instant, "UTC")).toBe("2026-09-06");
  });

  it("uses the training-zone creation date at a Sunday/Monday boundary", () => {
    expect(planWeekNumber("2026-09-06T22:30:00Z", 12, "2026-09-07")).toBe(1);
    expect(planWeekNumber("2026-09-06T22:30:00Z", 12, "2026-09-14")).toBe(2);
  });
});
