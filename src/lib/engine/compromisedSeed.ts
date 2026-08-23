// ============================================================================
// The compromised-running catalogue as SQL.
//
// A plan is stored as references into workout_blocks, so every session in
// compromisedSessions.ts needs a row there. Authoring them twice — once in
// TypeScript, once in SQL — is how the two drift apart, so the SQL is
// generated from the catalogue and a test fails when the file on disk no
// longer matches.
//
// Regenerate after editing a session:
//   WRITE_SEED=1 npx vitest run compromisedSeed
// then run supabase/setup.sql (or the seed file alone) against the database.
// ============================================================================
import { COMPROMISED_SESSIONS, renderCompromised, type CompromisedSession } from "./compromisedSessions";
import type { WorkoutBlock } from "./types";

/** Difficulty tier follows the level the session was written for. */
function tierFor(session: CompromisedSession): number {
  switch (session.level) {
    case "beginner":
    case "intermediate":
      return 1;
    case "advanced":
      return 2;
    default:
      return 3;
  }
}

/**
 * The catalogue as library rows — the same shape loadLibrary() returns. The
 * SQL below is a rendering of exactly this, so what the engine expects to find
 * in workout_blocks and what the seed puts there cannot come apart.
 */
export function compromisedLibraryBlocks(): WorkoutBlock[] {
  return COMPROMISED_SESSIONS.map((session) => ({
    id: session.block_id,
    slug: session.slug,
    block_type: "main" as const,
    station: session.station ?? null,
    content: renderCompromised(session),
    equipment_variant: "gym" as const,
    difficulty_tier: tierFor(session),
    session_types: ["compromised_run" as const],
    tags: ["compromised", session.level, session.phase, ...(session.station ? [session.station] : [])],
  }));
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

function rowFor(block: WorkoutBlock): string {
  return [
    `(${quote(block.id)}, ${quote(block.slug ?? "")}, 'main', ${
      block.station ? quote(block.station) : "null"
    },`,
    ` ${quote(JSON.stringify(block.content))}::jsonb,`,
    ` 'gym', ${block.difficulty_tier}, '{compromised_run}', '{${block.tags.join(",")}}')`,
  ].join("\n");
}

/**
 * The whole catalogue as one idempotent statement. `do update` rather than
 * `do nothing`: re-running the seed is how a tuned session reaches a database
 * that already has the old wording.
 */
export function compromisedSeedSql(): string {
  const header = [
    "-- ============================================================================",
    "-- Compromised running: 60 sessions, five levels x four phases x three.",
    "--",
    "-- GENERATED from src/lib/engine/compromisedSessions.ts — do not edit by hand.",
    "--   WRITE_SEED=1 npx vitest run compromisedSeed",
    "--",
    "-- The ids are pinned in the catalogue, because the engine names them while",
    "-- building a plan: session_blocks.block_id points straight at these rows.",
    "-- ============================================================================",
    "",
    "insert into workout_blocks (id, slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values",
  ].join("\n");

  const rows = compromisedLibraryBlocks().map(rowFor).join(",\n");

  const footer = [
    "on conflict (slug) do update set",
    "  content = excluded.content,",
    "  station = excluded.station,",
    "  difficulty_tier = excluded.difficulty_tier,",
    "  session_types = excluded.session_types,",
    "  tags = excluded.tags;",
    "",
  ].join("\n");

  return `${header}\n${rows}\n${footer}`;
}
