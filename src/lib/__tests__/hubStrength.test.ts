import { describe, expect, it } from "vitest";
import { HubStrengthBody, mapSets, pickStrengthSession } from "@/lib/hubStrength";
import { hubBearerOk } from "@/lib/hubAuth";

describe("MyHealthHub strength: matching", () => {
  const open = [
    { id: "tue", day_hint: 2 },
    { id: "fri", day_hint: 5 },
  ];

  it("takes the open strength session of the same day", () => {
    expect(pickStrengthSession(open, 5)?.id).toBe("fri");
  });

  it("otherwise the closest open one of the week, earlier on a tie", () => {
    expect(pickStrengthSession(open, 3)?.id).toBe("tue");
    expect(pickStrengthSession(open, 4)?.id).toBe("fri");
    expect(pickStrengthSession([{ id: "a", day_hint: 2 }, { id: "b", day_hint: 6 }], 4)?.id).toBe("a");
  });

  it("matches nothing when the week has no open strength session", () => {
    expect(pickStrengthSession([], 3)).toBeNull();
  });
});

describe("MyHealthHub strength: payload", () => {
  it("accepts a workout and a deletion, rejects anything else", () => {
    expect(
      HubStrengthBody.safeParse({
        hub_workout_id: "6f1c",
        deleted: false,
        date: "2026-11-12",
        duration_min: 61,
        rpe: 8,
        sets: [{ exercise_name: "Kniebeuge", set_number: 1, reps: 5, load_kg: 100 }],
      }).success,
    ).toBe(true);
    expect(HubStrengthBody.safeParse({ hub_workout_id: "6f1c", deleted: true }).success).toBe(true);
    expect(HubStrengthBody.safeParse({ hub_workout_id: "6f1c", deleted: false, date: "12.11.2026" }).success).toBe(false);
    expect(
      HubStrengthBody.safeParse({ hub_workout_id: "6f1c", deleted: false, date: "2026-11-12", sets: [{ exercise_name: "x", set_number: 13, reps: 1, load_kg: 1 }] }).success,
    ).toBe(false);
  });

  it("maps sets onto the athlete's own exercises by name and drops empty ones", () => {
    const sets = mapSets(
      [
        { exercise_name: "Kniebeuge ", set_number: 1, reps: 5, load_kg: 100 },
        { exercise_name: "Ruderzug", set_number: 1, reps: 10, load_kg: 60 },
        { exercise_name: "Plank", set_number: 1, reps: null, load_kg: null },
      ],
      [{ id: "ex-squat", name: "kniebeuge" }],
    );
    expect(sets).toEqual([
      { exercise_id: "ex-squat", exercise_name: "Kniebeuge", set_number: 1, reps: 5, load_kg: 100 },
      { exercise_id: null, exercise_name: "Ruderzug", set_number: 1, reps: 10, load_kg: 60 },
    ]);
  });
});

describe("MyHealthHub routes: bearer", () => {
  const req = (auth?: string) => new Request("https://app/api/hub/export", { headers: auth ? { authorization: auth } : {} });
  it("fails closed without a secret and compares exactly", () => {
    expect(hubBearerOk(req("Bearer abc"), undefined)).toBe(false);
    expect(hubBearerOk(req("Bearer abc"), "abc")).toBe(true);
    expect(hubBearerOk(req("Bearer abcd"), "abc")).toBe(false);
    expect(hubBearerOk(req("abc"), "abc")).toBe(false);
    expect(hubBearerOk(req(), "abc")).toBe(false);
  });
});
