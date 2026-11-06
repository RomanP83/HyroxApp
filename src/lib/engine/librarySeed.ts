// ============================================================================
// The levelled catalogues as SQL.
//
// A plan is stored as references into workout_blocks, so every session in
// compromisedSessions.ts, stationSessions.ts and intervalSessions.ts needs a
// row there. Authoring
// them twice — once in TypeScript, once in SQL — is how the two drift apart,
// so the SQL is generated from the catalogues and a test fails when a file on
// disk no longer matches.
//
// Regenerate after editing a session:
//   WRITE_SEED=1 npx vitest run librarySeed
// then run supabase/setup.sql (or the seed files alone) against the database.
// ============================================================================
import { COMPROMISED_SESSIONS } from "./compromisedSessions";
import { STATION_SESSIONS } from "./stationSessions";
import { INTERVAL_SESSIONS } from "./intervalSessions";
import { renderCatalogue, type CatalogueSession } from "./catalogue";
import type { SessionType, WorkoutBlock } from "./types";

/** What a catalogue's rows are called in the library's own tag vocabulary. */
const TAG: Partial<Record<SessionType, string>> = {
  compromised_run: "compromised",
  station_work: "station",
  run_intervals: "intervals",
};

/** Difficulty tier follows the level the session was written for. */
function tierFor(session: CatalogueSession): number {
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

function libraryBlocks(catalogue: CatalogueSession[], sessionType: SessionType): WorkoutBlock[] {
  return catalogue.map((session) => ({
    id: session.block_id,
    slug: session.slug,
    block_type: "main" as const,
    station: session.station ?? null,
    content: renderCatalogue(session),
    equipment_variant: "gym" as const,
    difficulty_tier: tierFor(session),
    session_types: [sessionType],
    tags: [
      TAG[sessionType] ?? sessionType,
      session.level,
      session.phase,
      ...(session.station ? [session.station] : []),
    ],
  }));
}

/**
 * Each catalogue as library rows — the same shape loadLibrary() returns. The
 * SQL below is a rendering of exactly this, so what the engine expects to find
 * in workout_blocks and what the seed puts there cannot come apart.
 */
export function compromisedLibraryBlocks(): WorkoutBlock[] {
  return libraryBlocks(COMPROMISED_SESSIONS, "compromised_run");
}

export function stationLibraryBlocks(): WorkoutBlock[] {
  return libraryBlocks(STATION_SESSIONS, "station_work");
}

export function intervalLibraryBlocks(): WorkoutBlock[] {
  return libraryBlocks(INTERVAL_SESSIONS, "run_intervals");
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

function rowFor(block: WorkoutBlock): string {
  return [
    `(${quote(block.id)}, ${quote(block.slug ?? "")}, 'main', ${
      block.station ? quote(block.station) : "null"
    },`,
    ` ${quote(JSON.stringify(block.content))}::jsonb,`,
    ` 'gym', ${block.difficulty_tier}, '{${block.session_types.join(",")}}', '{${block.tags.join(",")}}')`,
  ].join("\n");
}

/**
 * One catalogue as one idempotent statement. `do update` rather than
 * `do nothing`: re-running the seed is how a tuned session reaches a database
 * that already has the old wording.
 */
function seedSql(title: string, source: string, blocks: WorkoutBlock[]): string {
  const header = [
    "-- ============================================================================",
    `-- ${title}`,
    "--",
    `-- GENERATED from src/lib/engine/${source} — do not edit by hand.`,
    "--   WRITE_SEED=1 npx vitest run librarySeed",
    "--",
    "-- The ids are pinned in the catalogue, because the engine names them while",
    "-- building a plan: session_blocks.block_id points straight at these rows.",
    "-- ============================================================================",
    "",
    "insert into workout_blocks (id, slug, block_type, station, content, equipment_variant, difficulty_tier, session_types, tags) values",
  ].join("\n");

  const footer = [
    "on conflict (slug) do update set",
    "  content = excluded.content,",
    "  station = excluded.station,",
    "  difficulty_tier = excluded.difficulty_tier,",
    "  session_types = excluded.session_types,",
    "  tags = excluded.tags;",
    "",
  ].join("\n");

  return `${header}\n${blocks.map(rowFor).join(",\n")}\n${footer}`;
}

export function compromisedSeedSql(): string {
  return seedSql(
    "Compromised running: 60 sessions, five levels x four phases x three.",
    "compromisedSessions.ts",
    compromisedLibraryBlocks(),
  );
}

export function stationSeedSql(): string {
  return seedSql(
    "Isolated station work: 60 sessions, five levels x four phases x three.",
    "stationSessions.ts",
    stationLibraryBlocks(),
  );
}

export function intervalSeedSql(): string {
  return seedSql(
    "Threshold and VO2max intervals: 86 sessions across five levels and four phases.",
    "intervalSessions.ts",
    intervalLibraryBlocks(),
  );
}
