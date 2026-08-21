import { describe, it, expect } from "vitest";
import {
  allocateCycle,
  classifyWeakness,
  currentSeasonBlock,
  nextAnchorRace,
  planSeason,
  SEASON_TUNING,
  type SeasonPlan,
} from "../index";

/** The brief's own example: an autumn start, one A race in March. */
const SEASON: SeasonPlan = planSeason({
  startDate: "2026-10-01",
  races: [{ date: "2027-03-20", type: "Hyrox Open Men", priority: "A" }],
  trainingDaysPerWeek: 5,
  weaknesses: ["Sled Push", "Laktattoleranz", "Wall Balls"],
});

function allBlocks(season: SeasonPlan) {
  return season.macrocycles.flatMap((m) => m.blocks);
}

describe("planSeason — structure", () => {
  it("covers every week exactly once, with no gap and no overlap", () => {
    const blocks = allBlocks(SEASON);
    let expected = 1;
    for (const b of blocks) {
      expect(b.start_week).toBe(expected);
      expect(b.end_week).toBe(b.start_week + b.weeks - 1);
      expected = b.end_week + 1;
    }
    expect(expected - 1).toBe(SEASON.total_weeks);
  });

  it("starts on the Monday of the start week and runs a full year by default", () => {
    expect(SEASON.start_date).toBe("2026-09-28"); // Monday of 2026-10-01
    expect(SEASON.total_weeks).toBe(SEASON_TUNING.default_horizon_weeks);
  });

  it("builds backwards to the race: base -> build -> race specific -> taper", () => {
    const cycle = SEASON.macrocycles[0];
    expect(cycle.target_race_index).toBe(0);
    expect(cycle.blocks.map((b) => b.kind)).toEqual(["base", "build", "race_specific", "taper"]);
    // The taper ends in the race week itself.
    expect(cycle.end_week).toBe(SEASON.races[0].week_number);
  });

  it("gives a cycle that can carry it the full 6-8 week race-specific block", () => {
    const rs = SEASON.macrocycles[0].blocks.find((b) => b.kind === "race_specific")!;
    expect(rs.weeks).toBeGreaterThanOrEqual(SEASON_TUNING.race_specific_full_min_weeks);
  });

  it("keeps the race-specific and build blocks inside the coached ranges", () => {
    const cycle = SEASON.macrocycles[0];
    const rs = cycle.blocks.find((b) => b.kind === "race_specific")!;
    const build = cycle.blocks.find((b) => b.kind === "build")!;
    expect(rs.weeks).toBeGreaterThanOrEqual(SEASON_TUNING.race_specific_min_weeks);
    expect(rs.weeks).toBeLessThanOrEqual(SEASON_TUNING.race_specific_max_weeks);
    expect(build.weeks).toBeLessThanOrEqual(SEASON_TUNING.build_max_weeks);
  });

  it("plans an open base block after the last race and says so", () => {
    const tail = SEASON.macrocycles[SEASON.macrocycles.length - 1];
    expect(tail.target_race_index).toBeNull();
    expect(tail.blocks.map((b) => b.kind)).toEqual(["post_race_recovery", "open_base"]);
    expect(SEASON.notes.some((n) => n.includes("open base block"))).toBe(true);
  });
});

describe("planSeason — deloads", () => {
  it("deloads every 4th training week, and never in a taper or recovery week", () => {
    const blocks = allBlocks(SEASON);
    const taperWeeks = new Set<number>();
    const recoveryWeeks = new Set<number>();
    for (const b of blocks) {
      for (let w = b.start_week; w <= b.end_week; w++) {
        if (b.kind === "taper") taperWeeks.add(w);
        if (b.kind === "post_race_recovery") recoveryWeeks.add(w);
      }
    }
    expect(SEASON.deload_weeks.length).toBeGreaterThan(3);
    for (const w of SEASON.deload_weeks) {
      expect(taperWeeks.has(w)).toBe(false);
      expect(recoveryWeeks.has(w)).toBe(false);
    }
    // Inside the race cycle they sit ~4 weeks apart. A gap of 3 is the one
    // allowed deviation: a deload that would fall on the opening week of a
    // block moves to the last week of the block before it.
    const inCycle = SEASON.deload_weeks.filter((w) => w <= SEASON.races[0].week_number);
    for (let i = 1; i < inCycle.length; i++) {
      const gap = inCycle[i] - inCycle[i - 1];
      expect(gap).toBeGreaterThanOrEqual(SEASON_TUNING.deload_every_n_weeks - 1);
      expect(gap).toBeLessThanOrEqual(SEASON_TUNING.deload_every_n_weeks + 1);
    }
  });

  it("never deloads the opening week of a block — it moves to the week before", () => {
    const opening = new Set(allBlocks(SEASON).map((b) => b.start_week));
    for (const w of SEASON.deload_weeks) expect(opening.has(w)).toBe(false);
    // In the reference season that shift is what puts a deload at the end of
    // the build block, right before the race-specific work starts.
    const build = SEASON.macrocycles[0].blocks.find((b) => b.kind === "build")!;
    expect(build.deload_weeks).toContain(build.end_week);
  });

  it("never deloads the sharpening week right before the taper", () => {
    const cycle = SEASON.macrocycles[0];
    const taper = cycle.blocks.find((b) => b.kind === "taper")!;
    expect(SEASON.deload_weeks).not.toContain(taper.start_week - 1);
  });
});

describe("planSeason — multi-race logic", () => {
  const multi = planSeason({
    startDate: "2026-10-01",
    races: [
      { date: "2027-01-16", type: "Hyrox Open", priority: "A" },
      { date: "2027-02-27", type: "Hyrox Doubles", priority: "A" },
      { date: "2027-05-15", type: "Hyrox Pro", priority: "A" },
    ],
    trainingDaysPerWeek: 5,
    weaknesses: ["Sled Push"],
  });

  it("gives every A race its own macrocycle and its own taper", () => {
    expect(multi.macrocycles.filter((m) => m.target_race_index !== null)).toHaveLength(3);
    for (const m of multi.macrocycles) {
      if (m.target_race_index === null) continue;
      expect(m.blocks.some((b) => b.kind === "taper")).toBe(true);
      expect(m.blocks[0].kind).toBe(m.sort_order === 0 ? "base" : "post_race_recovery");
    }
  });

  it("turns a six-week gap into recovery + bridge + taper, and explains it", () => {
    const second = multi.macrocycles[1];
    expect(second.blocks.map((b) => b.kind)).toEqual(["post_race_recovery", "bridge", "taper"]);
    expect(multi.notes.some((n) => n.includes("re-build bridge"))).toBe(true);
  });

  it("gives the long third cycle a real build again", () => {
    const third = multi.macrocycles[2];
    expect(third.blocks.map((b) => b.kind)).toContain("build");
    expect(third.blocks[0].kind).toBe("post_race_recovery");
  });

  it("treats a B race as a hard training day inside the block it falls in", () => {
    const withB = planSeason({
      startDate: "2026-10-01",
      races: [
        { date: "2026-11-21", type: "Local Hyrox", priority: "B" },
        { date: "2027-03-20", type: "Hyrox Open Men", priority: "A" },
      ],
      trainingDaysPerWeek: 4,
    });
    // Only the A race anchors a cycle — the B race gets no taper of its own.
    expect(withB.macrocycles.filter((m) => m.target_race_index !== null)).toHaveLength(1);
    const bRace = withB.races.find((r) => r.priority === "B")!;
    expect(bRace.is_anchor).toBe(false);
    const host = allBlocks(withB).find(
      (b) => bRace.week_number >= b.start_week && bRace.week_number <= b.end_week,
    )!;
    expect(host.race_indexes).toContain(bRace.index);
    expect(withB.notes.some((n) => n.includes("hard training day"))).toBe(true);
  });

  it("promotes the last race when no A race was given", () => {
    const noA = planSeason({
      startDate: "2026-10-01",
      races: [
        { date: "2026-12-05", type: "Hyrox B", priority: "B" },
        { date: "2027-02-06", type: "Hyrox C", priority: "C" },
      ],
      trainingDaysPerWeek: 4,
    });
    expect(noA.races[1].is_anchor).toBe(true);
    expect(noA.notes.some((n) => n.includes("No A race given"))).toBe(true);
  });

  it("ignores races that already happened", () => {
    const past = planSeason({
      startDate: "2026-10-01",
      races: [
        { date: "2026-05-01", type: "Old race", priority: "A" },
        { date: "2027-03-20", type: "Hyrox Open Men", priority: "A" },
      ],
      trainingDaysPerWeek: 4,
    });
    expect(past.races).toHaveLength(1);
    expect(past.notes.some((n) => n.includes("before the season start"))).toBe(true);
  });
});

describe("allocateCycle", () => {
  it("never loses or invents a week, at any length", () => {
    for (let weeks = 1; weeks <= 60; weeks++) {
      for (const previous of [null, "A", "B"] as const) {
        const a = allocateCycle({ weeks, priority: "A", previousRacePriority: previous });
        const sum = Object.values(a).reduce((s, v) => s + v, 0);
        expect(sum, `weeks=${weeks} previous=${previous}`).toBe(weeks);
      }
    }
  });

  it("protects the taper first — even a two-week runway keeps one", () => {
    expect(allocateCycle({ weeks: 2, priority: "A" }).taper).toBe(1);
    expect(allocateCycle({ weeks: 1, priority: "A" }).taper).toBe(1);
  });

  it("gives a long A-race cycle the two-week taper, a short one a single week", () => {
    expect(allocateCycle({ weeks: 20, priority: "A" }).taper).toBe(SEASON_TUNING.taper_weeks_long);
    expect(allocateCycle({ weeks: 8, priority: "A" }).taper).toBe(SEASON_TUNING.taper_weeks_short);
  });

  it("spends a long runway on base rather than stretching the sharp work", () => {
    const long = allocateCycle({ weeks: 40, priority: "A" });
    expect(long.race_specific).toBe(SEASON_TUNING.race_specific_max_weeks);
    expect(long.build).toBe(SEASON_TUNING.build_max_weeks);
    expect(long.base).toBeGreaterThan(long.build);
  });

  it("recovers longer after an A race than after a B race", () => {
    const afterA = allocateCycle({ weeks: 16, priority: "A", previousRacePriority: "A" });
    const afterB = allocateCycle({ weeks: 16, priority: "A", previousRacePriority: "B" });
    expect(afterA.post_race_recovery).toBe(SEASON_TUNING.recovery_weeks.A);
    expect(afterB.post_race_recovery).toBe(SEASON_TUNING.recovery_weeks.B);
  });
});

describe("weakness targeting", () => {
  it("routes each weakness to the block that is the right place for it", () => {
    expect(classifyWeakness("Sled Push")).toBe("strength");
    expect(classifyWeakness("Laktattoleranz")).toBe("metabolic");
    expect(classifyWeakness("Wall Balls")).toBe("race_execution");
    expect(classifyWeakness("etwas ganz anderes")).toBe("general");

    const byKind = Object.fromEntries(allBlocks(SEASON).map((b) => [b.kind, b.weakness_targets]));
    expect(byKind.base).toContain("Sled Push");
    expect(byKind.build).toContain("Laktattoleranz");
    expect(byKind.race_specific).toContain("Wall Balls");
    // A taper is not the place to fix a weakness.
    expect(byKind.taper).toEqual([]);
  });
});

describe("season helpers", () => {
  it("locates the athlete in the season", () => {
    const here = currentSeasonBlock(SEASON, "2026-10-01");
    expect(here?.week_number).toBe(1);
    expect(here?.block.kind).toBe("base");
    expect(currentSeasonBlock(SEASON, "2026-01-01")).toBeNull();
  });

  it("names the race the detailed plan should be built for", () => {
    expect(nextAnchorRace(SEASON, "2026-10-01")?.date).toBe("2027-03-20");
    expect(nextAnchorRace(SEASON, "2027-04-01")).toBeNull();
  });
});
