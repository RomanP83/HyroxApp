// ============================================================================
// Excel -> strength template.
//
// Copying a range out of Excel puts TAB-separated text on the clipboard, so a
// paste box plus a deterministic parser is the whole import. No model, no file
// upload, no column mapping dialog: the sheet a lifter actually keeps is
// regular enough to read directly.
//
// It has to survive the real thing, not an idealised CSV:
//   - a leading numbering column ("1", "2", …) that is not data
//   - a rep RANGE written as "6 - 8", "6-8" or "6 – 8"
//   - the trailing per-set columns ("Satz 1", "Satz 2") that hold what was
//     lifted last time, not what is planned
//   - a bodyweight row with no sets and no weight, only the set results
//   - "im Supersatz" as a marker on the exercises that are paired
// ============================================================================

export interface ParsedExercise {
  position: number;
  name: string;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  load_kg: number | null;
  superset_group: string | null;
  /** Reps per set from the sheet — the last session, not the plan. */
  last_set_reps: number[];
}

export interface ParsedTemplate {
  /** Taken from the header cell ("Tag A: Oberkörper") when the sheet has one. */
  name: string | null;
  exercises: ParsedExercise[];
  /** Anything the parser had to decide or drop, in plain words. */
  warnings: string[];
}

const HEADER_PATTERNS = {
  sets: /^(s[aä]tze|sets)$/i,
  reps: /^(wiederholungen|wdh\.?|reps|repetitions)$/i,
  load: /^(gewicht|last|weight|kg|load)$/i,
  setResult: /^(satz|set)\s*\d+$/i,
};

const SUPERSET_MARKER = /\s*(im\s+supersatz|superset|\(ss\))\s*$/i;

/** "22", "22,5", "22.5 kg", "2x16" (per-hand) -> a number, or null. */
export function parseLoad(raw: string): number | null {
  const cleaned = raw.trim().toLowerCase().replace(/kg\.?$/i, "").trim();
  if (!cleaned) return null;
  // "2x16" / "2 x 16": dumbbell pairs are written per hand — keep the per-hand
  // number, which is what a lifter puts on the bar.
  const pair = cleaned.match(/^\d+\s*[x×]\s*([\d.,]+)$/);
  const value = pair ? pair[1] : cleaned;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** "6 - 8" / "6-8" / "6 – 8" / "12" -> [min, max], or [null, null]. */
export function parseRepRange(raw: string): [number | null, number | null] {
  const cleaned = raw.trim().replace(/\s+/g, "");
  if (!cleaned) return [null, null];
  const range = cleaned.match(/^(\d+)[-–—bis]+(\d+)$/i);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return lo <= hi ? [lo, hi] : [hi, lo];
  }
  const single = cleaned.match(/^(\d+)$/);
  if (single) return [Number(single[1]), Number(single[1])];
  return [null, null];
}

function splitRows(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (line.includes("\t") ? line.split("\t") : line.split(/\s*;\s*|,(?=(?:[^"]*"[^"]*")*[^"]*$)/)))
    .map((cells) => cells.map((c) => c.replace(/^"|"$/g, "").trim()))
    .filter((cells) => cells.some((c) => c.length > 0));
}

interface Columns {
  name: number;
  sets: number | null;
  reps: number | null;
  load: number | null;
  setResults: number[];
}

/** Read the header row when there is one; fall back to the usual sheet order. */
function columnsFrom(header: string[] | null, width: number): Columns {
  if (header) {
    const cols: Columns = { name: -1, sets: null, reps: null, load: null, setResults: [] };
    header.forEach((cell, i) => {
      if (HEADER_PATTERNS.sets.test(cell)) cols.sets = i;
      else if (HEADER_PATTERNS.reps.test(cell)) cols.reps = i;
      else if (HEADER_PATTERNS.load.test(cell)) cols.load = i;
      else if (HEADER_PATTERNS.setResult.test(cell)) cols.setResults.push(i);
      else if (cols.name < 0 && cell.length > 2) cols.name = i;
    });
    if (cols.name >= 0) return cols;
  }
  // No header: numbering, name, sets, reps, load, then set results.
  return {
    name: 1,
    sets: 2,
    reps: 3,
    load: 4,
    setResults: Array.from({ length: Math.max(0, width - 5) }, (_, i) => i + 5),
  };
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some(
    (c) =>
      HEADER_PATTERNS.sets.test(c) ||
      HEADER_PATTERNS.reps.test(c) ||
      HEADER_PATTERNS.load.test(c) ||
      HEADER_PATTERNS.setResult.test(c),
  );
}

/** A pure name cell: text, and not just the row number. */
function isExerciseName(cell: string): boolean {
  return cell.length > 1 && /[a-zä-ü]/i.test(cell);
}

export function parseStrengthTemplate(text: string): ParsedTemplate {
  const warnings: string[] = [];
  const rows = splitRows(text);
  if (!rows.length) return { name: null, exercises: [], warnings: ["nothing to read"] };

  const headerIndex = rows.findIndex(looksLikeHeader);
  const header = headerIndex >= 0 ? rows[headerIndex] : null;
  const width = Math.max(...rows.map((r) => r.length));
  const cols = columnsFrom(header, width);

  // The day's name usually sits in the header row's own name cell.
  let name: string | null = null;
  if (header && cols.name >= 0 && isExerciseName(header[cols.name] ?? "")) {
    name = header[cols.name].trim();
  }

  const body = rows.filter((_, i) => i !== headerIndex);
  const exercises: ParsedExercise[] = [];
  let supersetRun = 0;

  for (const cells of body) {
    const at = (i: number | null) => (i == null ? "" : (cells[i] ?? "").trim());
    let rawName = at(cols.name);
    // A shifted row (e.g. no leading number) — take the first text cell.
    if (!isExerciseName(rawName)) {
      const fallback = cells.findIndex(isExerciseName);
      if (fallback < 0) continue;
      rawName = cells[fallback].trim();
    }

    const isSuperset = SUPERSET_MARKER.test(rawName);
    const exerciseName = rawName.replace(SUPERSET_MARKER, "").trim();
    if (!exerciseName) continue;

    const [repMin, repMax] = parseRepRange(at(cols.reps));
    const load = parseLoad(at(cols.load));
    const lastSetReps = cols.setResults
      .map((i) => Number((cells[i] ?? "").replace(",", ".")))
      .filter((n) => Number.isFinite(n) && n > 0);

    const declaredSets = Number(at(cols.sets));
    const sets = Number.isFinite(declaredSets) && declaredSets > 0
      ? Math.min(12, Math.round(declaredSets))
      : Math.max(1, Math.min(12, lastSetReps.length || 3));
    if (!(Number.isFinite(declaredSets) && declaredSets > 0)) {
      warnings.push(
        `"${exerciseName}": no set count in the sheet — took ${sets} from the logged sets.`,
      );
    }
    if (load == null) {
      warnings.push(`"${exerciseName}": no weight — treated as bodyweight.`);
    }

    // Consecutive marked rows belong to the same superset.
    if (isSuperset) supersetRun += 1;
    else supersetRun = 0;
    const previous = exercises[exercises.length - 1];
    const group = isSuperset
      ? supersetRun > 1 && previous?.superset_group
        ? previous.superset_group
        : String.fromCharCode(64 + (exercises.filter((e) => e.superset_group).length ? 2 : 1))
      : null;

    exercises.push({
      position: exercises.length,
      name: exerciseName,
      sets,
      rep_min: repMin,
      rep_max: repMax,
      load_kg: load,
      superset_group: group,
      last_set_reps: lastSetReps,
    });
  }

  if (!exercises.length) warnings.push("no exercise rows found — is the header row included?");
  return { name, exercises, warnings };
}
