// ============================================================================
// A swap is only worth having if it stays honest: every substitute must say
// what it does not replace, and none of them may quietly reach for equipment
// the athlete does not have.
// ============================================================================
import { describe, expect, it } from "vitest";
import {
  alternativesFor,
  findAlternative,
  resolveSubstitutions,
  STATION_ALTERNATIVES,
  STATIONS,
} from "../index";

const RACE_STATIONS = STATIONS.filter((s) => s !== "run" && s !== "general");

describe("the alternatives catalogue", () => {
  it("gives every race station somewhere to go", () => {
    for (const station of RACE_STATIONS) {
      expect(STATION_ALTERNATIVES[station].length).toBeGreaterThanOrEqual(2);
    }
  });

  it("files every alternative under the station it belongs to", () => {
    for (const [station, list] of Object.entries(STATION_ALTERNATIVES)) {
      for (const alt of list) expect(alt.station).toBe(station);
    }
  });

  it("uses a unique slug for each, because the slug is what gets stored", () => {
    const slugs = Object.values(STATION_ALTERNATIVES).flat().map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("makes every substitute name its cost, not just its benefit", () => {
    // The rule this file exists for. A swap that only advertises what it keeps
    // changes what the session trains without telling anyone.
    for (const alt of Object.values(STATION_ALTERNATIVES).flat()) {
      expect(alt.keeps.trim().length).toBeGreaterThan(10);
      expect(alt.costs.trim().length).toBeGreaterThan(10);
      expect(alt.prescription.trim().length).toBeGreaterThan(10);
    }
  });

  it("never offers a home athlete something that needs a gym", () => {
    for (const station of RACE_STATIONS) {
      for (const alt of alternativesFor(station, "home_minimal")) {
        expect(alt.needs).not.toBe("gym");
      }
    }
  });

  it("leaves every race station with at least one option at home", () => {
    // A substitution list that empties out the moment someone trains in a
    // garage is a list for people who did not need it.
    for (const station of RACE_STATIONS) {
      expect(alternativesFor(station, "home_minimal").length).toBeGreaterThan(0);
    }
  });

  it("offers nothing for running or the general slot", () => {
    expect(alternativesFor("run")).toHaveLength(0);
    expect(alternativesFor("general")).toHaveLength(0);
  });
});

describe("reading back what an athlete stored", () => {
  it("finds an alternative by the slug that was stored", () => {
    const alt = STATION_ALTERNATIVES.sled_push[0];
    expect(findAlternative(alt.slug)).toEqual(alt);
    expect(findAlternative("no_such_thing")).toBeNull();
  });

  it("drops a stored slug that no longer exists", () => {
    // Catalogue entries can be renamed; a stale row must not render as a blank
    // substitution that silently deletes the prescription.
    const resolved = resolveSubstitutions({ sled_push: "retired_slug" });
    expect(resolved.sled_push).toBeUndefined();
  });

  it("drops a slug filed under the wrong station", () => {
    const wallBall = STATION_ALTERNATIVES.wall_balls[0].slug;
    expect(resolveSubstitutions({ sled_push: wallBall }).sled_push).toBeUndefined();
  });

  it("resolves the good ones and leaves the rest alone", () => {
    const good = STATION_ALTERNATIVES.wall_balls[0];
    const resolved = resolveSubstitutions({ wall_balls: good.slug, sled_pull: "nonsense" });
    expect(resolved.wall_balls).toEqual(good);
    expect(Object.keys(resolved)).toEqual(["wall_balls"]);
  });

  it("survives an empty or missing record", () => {
    expect(resolveSubstitutions(null)).toEqual({});
    expect(resolveSubstitutions(undefined)).toEqual({});
    expect(resolveSubstitutions({})).toEqual({});
  });
});
