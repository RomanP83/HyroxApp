// The catalogue and the SQL that stores it must agree. When they do not, a
// plan either saves a session nobody can read back or fails outright, so this
// is checked rather than remembered.
//
//   WRITE_SEED=1 npx vitest run compromisedSeed
//
// rewrites the seed file and the setup.sql mirror from the catalogue.
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { COMPROMISED_SESSIONS } from "../compromisedSessions";
import { compromisedSeedSql } from "../compromisedSeed";

const root = resolve(__dirname, "../../../..");
const SEED = resolve(root, "supabase/seed/0004_compromised_running.sql");
const SETUP = resolve(root, "supabase/setup.sql");
const OPEN = "-- >>> generated: compromised running";
const CLOSE = "-- <<< generated: compromised running";

const write = process.env.WRITE_SEED === "1";

function mirrorInSetup(sql: string): string {
  const setup = readFileSync(SETUP, "utf8");
  const block = `${OPEN}\n${sql}${CLOSE}\n`;
  const from = setup.indexOf(OPEN);
  if (from === -1) return `${setup.trimEnd()}\n\n${block}`;
  const to = setup.indexOf(CLOSE, from) + CLOSE.length + 1;
  return setup.slice(0, from) + block + setup.slice(to);
}

describe("compromised running is stored as well as authored", () => {
  const sql = compromisedSeedSql();

  it("pins a unique id and slug on every session", () => {
    const ids = new Set(COMPROMISED_SESSIONS.map((s) => s.block_id));
    const slugs = new Set(COMPROMISED_SESSIONS.map((s) => s.slug));
    expect(ids.size).toBe(COMPROMISED_SESSIONS.length);
    expect(slugs.size).toBe(COMPROMISED_SESSIONS.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("has a seeded library row for every session in the catalogue", () => {
    if (write) writeFileSync(SEED, sql);
    expect(readFileSync(SEED, "utf8")).toBe(sql);
    for (const s of COMPROMISED_SESSIONS) expect(sql).toContain(`'${s.block_id}'`);
  });

  it("mirrors the seed into setup.sql, like every other migration", () => {
    if (write) writeFileSync(SETUP, mirrorInSetup(sql));
    const setup = readFileSync(SETUP, "utf8");
    expect(setup).toContain(OPEN);
    expect(setup.slice(setup.indexOf(OPEN) + OPEN.length + 1, setup.indexOf(CLOSE))).toBe(sql);
  });
});
