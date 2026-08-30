// ============================================================================
// A session's station list has to describe the session.
//
// `station` alone was a headline, not a description: only 3 of the 60 station
// sessions train a single station, and 137 station appearances across the two
// catalogues went undeclared. Everything that reasons about how much a station
// gets trained now reads `stations`, so these tests keep that list tied to the
// exercise lines it claims to describe — edit a line without touching the list
// and this file fails.
// ============================================================================
import { describe, expect, it } from "vitest";
import { STATION_SESSIONS } from "../stationSessions";
import { COMPROMISED_SESSIONS } from "../compromisedSessions";
import { INTERVAL_SESSIONS } from "../intervalSessions";
import { STRENGTH_VARIANTS } from "../strengthVariants";
import { trainedStations } from "../catalogue";
import { STATIONS } from "../types";
import type { CatalogueSession } from "../catalogue";

const ALL = [...STATION_SESSIONS, ...COMPROMISED_SESSIONS];

/** The same keywords the annotation was derived from. */
const KEYS: [string, string[]][] = [
  ["ski_erg", ["skierg"]],
  ["sled_push", ["sled push", "prowler"]],
  ["sled_pull", ["sled pull", "rope pull", "sled drag"]],
  ["burpee_broad_jump", ["burpee"]],
  ["row", ["rowerg", "row,", "row at", "row "]],
  ["farmers_carry", ["farmer", "carry"]],
  ["sandbag_lunges", ["lunge"]],
  ["wall_balls", ["wall ball"]],
];
// A run described by what it follows is still a run.
const NOT_STATION = ["run at", "run —", "zone 2 run", "competition tempo", "box or broad jumps"];

function mentionedIn(session: CatalogueSession): string[] {
  const hit = new Set<string>();
  for (const line of session.lines) {
    if (line.is_run && !line.exercise.includes("→")) continue;
    // A simulation names its stations after an arrow: "Run 1 → SkiErg 1000 m".
    const text = (line.exercise.includes("→")
      ? line.exercise.split("→").slice(1).join(" ")
      : line.exercise
    ).toLowerCase();
    if (NOT_STATION.some((x) => text.includes(x))) continue;
    for (const [station, keys] of KEYS) {
      if (keys.some((k) => (text + " ").includes(k))) hit.add(station);
    }
  }
  return [...hit];
}

describe("what a session says it trains", () => {
  it("lists every station its own lines name", () => {
    for (const session of ALL) {
      const listed = trainedStations(session);
      for (const station of mentionedIn(session)) {
        expect(listed, `${session.slug} does not list ${station}`).toContain(station);
      }
    }
  });

  it("never lists a station that is not a station", () => {
    for (const session of ALL) {
      for (const station of trainedStations(session)) {
        expect(STATIONS, session.slug).toContain(station);
      }
    }
  });

  it("always includes its own headline", () => {
    for (const session of ALL) {
      if (!session.station) continue;
      expect(trainedStations(session), session.slug).toContain(session.station);
    }
  });

  it("lets a session train nothing rather than inventing a station", () => {
    // Goblet squats between two runs train no Hyrox station, and neither do
    // roxzone transition drills. An empty list is a real answer.
    const empty = ALL.filter((s) => trainedStations(s).length === 0);
    expect(empty.map((s) => s.slug)).toEqual(["cr_b1_squat_sandwich", "cr_a4_roxzone_drills"]);
  });

  it("has most sessions training more than one station", () => {
    // The finding this whole field exists for. If this ever drops back to
    // near-one, the catalogue changed shape and the weighting needs re-reading.
    const multi = ALL.filter((s) => trainedStations(s).length > 1).length;
    expect(multi).toBeGreaterThan(ALL.length / 2);
  });
});

describe("what does not count as station work", () => {
  it("leaves strength out of it", () => {
    // Strength sessions exist to make the athlete stronger, not to train a
    // station. Counting them would say the plan covers stations it does not.
    for (const variant of STRENGTH_VARIANTS) {
      expect((variant as { stations?: unknown }).stations, variant.slug).toBeUndefined();
    }
  });

  it("leaves the interval catalogue out of it", () => {
    // The one running session that carries no station work at all, on purpose.
    for (const session of INTERVAL_SESSIONS) {
      expect(trainedStations(session), session.slug).toEqual([]);
    }
  });
});
