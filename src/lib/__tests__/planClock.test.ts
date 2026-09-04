import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dateInTrainingZone, planWeekNumber, syncPlanWeekStatuses } from "../planClock";

describe("plan clock", () => {
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
