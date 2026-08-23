// The catalogues and the SQL that stores them must agree. When they do not, a
// plan either saves a session nobody can read back or fails outright, so this
// is checked rather than remembered.
//
//   WRITE_SEED=1 npx vitest run librarySeed
//
// rewrites the seed files and their setup.sql mirrors from the catalogues.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { COMPROMISED_SESSIONS } from "../compromisedSessions";
import { STATION_SESSIONS } from "../stationSessions";
import { compromisedSeedSql, stationSeedSql } from "../librarySeed";
import type { CatalogueSession } from "../catalogue";

const root = resolve(__dirname, "../../../..");
const SETUP = resolve(root, "supabase/setup.sql");
const write = process.env.WRITE_SEED === "1";

const catalogues: {
  what: string;
  sessions: CatalogueSession[];
  sql: string;
  file: string;
  marker: string;
}[] = [
  {
    what: "compromised running",
    sessions: COMPROMISED_SESSIONS,
    sql: compromisedSeedSql(),
    file: "supabase/seed/0004_compromised_running.sql",
    marker: "compromised running",
  },
  {
    what: "station work",
    sessions: STATION_SESSIONS,
    sql: stationSeedSql(),
    file: "supabase/seed/0005_station_work.sql",
    marker: "station work",
  },
];

function mirrorInSetup(setup: string, marker: string, sql: string): string {
  const open = `-- >>> generated: ${marker}`;
  const close = `-- <<< generated: ${marker}`;
  const block = `${open}\n${sql}${close}\n`;
  const from = setup.indexOf(open);
  if (from === -1) return `${setup.trimEnd()}\n\n${block}`;
  return setup.slice(0, from) + block + setup.slice(setup.indexOf(close, from) + close.length + 1);
}

// One pass over setup.sql for all catalogues, so two writes cannot race.
if (write) {
  let setup = readFileSync(SETUP, "utf8");
  for (const c of catalogues) {
    writeFileSync(resolve(root, c.file), c.sql);
    setup = mirrorInSetup(setup, c.marker, c.sql);
  }
  writeFileSync(SETUP, setup);
}

describe.each(catalogues)("$what is stored as well as authored", ({ sessions, sql, file, marker }) => {
  it("holds three sessions for every level and phase", () => {
    expect(sessions.length).toBe(60);
    const counted = new Map<string, number>();
    for (const s of sessions) {
      const key = `${s.level}/${s.phase}`;
      counted.set(key, (counted.get(key) ?? 0) + 1);
    }
    expect(counted.size).toBe(20);
    expect([...counted.values()].every((n) => n === 3)).toBe(true);
  });

  it("pins a unique id and slug on every session", () => {
    const ids = new Set(sessions.map((s) => s.block_id));
    expect(ids.size).toBe(sessions.length);
    expect(new Set(sessions.map((s) => s.slug)).size).toBe(sessions.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it("has a seeded library row for every session in the catalogue", () => {
    expect(readFileSync(resolve(root, file), "utf8")).toBe(sql);
    for (const s of sessions) expect(sql).toContain(`'${s.block_id}'`);
  });

  it("mirrors the seed into setup.sql, like every other migration", () => {
    const setup = readFileSync(SETUP, "utf8");
    const open = `-- >>> generated: ${marker}`;
    const close = `-- <<< generated: ${marker}`;
    expect(setup).toContain(open);
    expect(setup.slice(setup.indexOf(open) + open.length + 1, setup.indexOf(close))).toBe(sql);
  });
});

it("never gives two sessions the same id across catalogues", () => {
  const all = catalogues.flatMap((c) => c.sessions.map((s) => s.block_id));
  expect(new Set(all).size).toBe(all.length);
});
