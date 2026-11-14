import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildExportPayload } from "@/lib/exportPayload";

// Columns per table, read from supabase/setup.sql — the schema the database has.
function schema(): Map<string, Set<string>> {
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/setup.sql"), "utf8");
  const tables = new Map<string, Set<string>>();
  const create = /create table if not exists (?:public\.)?(\w+) \(([\s\S]*?)\n\);/g;
  for (const m of sql.matchAll(create)) {
    const cols = tables.get(m[1]) ?? new Set<string>();
    for (const line of m[2].split("\n")) {
      const word = line.trim().split(/\s+/)[0]?.replace(/,$/, "");
      if (word && /^[a-z_][a-z0-9_]*$/.test(word) && !["primary", "unique", "constraint", "check", "foreign"].includes(word)) cols.add(word);
    }
    tables.set(m[1], cols);
  }
  for (const m of sql.matchAll(/alter table (?:public\.)?(\w+)\s+add column if not exists (\w+)/g)) tables.get(m[1])?.add(m[2]);
  return tables;
}

// A Supabase stand-in that fails like Postgres on a column the table does not have.
function fakeClient(rows: Record<string, Record<string, unknown>[]>) {
  const cols = schema();
  const queried: string[] = [];
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            async in(column: string, ids: string[]) {
              queried.push(`${table}.${column}`);
              if (!cols.get(table)?.has(column)) return { data: null, error: { message: `column ${table}.${column} does not exist` } };
              return { data: (rows[table] ?? []).filter((r) => ids.includes(String(r[column]))), error: null };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, queried };
}

describe("buildExportPayload", () => {
  it("fragt nur Spalten ab, die es gibt, und nimmt die Rennen über Plan und Saison mit", async () => {
    const { client, queried } = fakeClient({
      plans: [{ id: "p1", profile_id: "me", race_id: "r1" }],
      seasons: [{ id: "se1", profile_id: "me" }],
      season_races: [{ id: "sr1", season_id: "se1", race_id: "r2" }],
      races: [{ id: "r1", name: "Verona" }, { id: "r2", name: "Rom" }, { id: "r3", name: "fremd" }],
    });
    const out = await buildExportPayload(client, { id: "me" });
    expect(out.season.races.map((r) => r.name)).toEqual(["Verona", "Rom"]);
    expect(queried).toContain("races.id");
    expect(queried).not.toContain("races.profile_id");
  });
});
