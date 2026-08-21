// ============================================================================
// Season layer — the annual macro plan that sits ABOVE the 4-20 week plan.
//
// buildPhasePlan() answers "how do I split the weeks to ONE race". This module
// answers "how does a year with one or several races hang together": where the
// base blocks sit, which race gets a real taper, what happens in the three
// weeks after a race, and what to do with a six-week gap between two A races.
//
// Same contract as the rest of the engine: pure, deterministic, no LLM. Same
// input -> same season, which is what makes it explainable and testable.
//
// Backward planning, per race cycle (all lengths from SEASON_TUNING):
//   post-race recovery -> base -> build -> race specific -> taper -> RACE
// and when a cycle is too short to hold that, it collapses in a fixed order:
// taper is protected first (PP4), then the race-specific work, then the build.
// ============================================================================

import { SEASON_TUNING } from "./constants";

export type RacePriority = "A" | "B" | "C";

export type SeasonBlockKind =
  | "post_race_recovery"
  | "base"
  | "build"
  | "race_specific"
  | "bridge"
  | "taper"
  | "open_base";

export interface SeasonRaceInput {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Free text, e.g. "Hyrox Open Men" or "Hyrox Doubles". */
  type: string;
  priority: RacePriority;
}

export interface SeasonInput {
  /** ISO date the season starts (today, or the first day of the block). */
  startDate: string;
  races: SeasonRaceInput[];
  /** 3..6 — decides how much a week can actually carry. */
  trainingDaysPerWeek: number;
  /** Free-text weaknesses ("Sled Push", "Laktattoleranz", "Wall Balls"). */
  weaknesses?: string[];
  /** Planning horizon; defaults to 52 weeks (or the last race + recovery). */
  horizonWeeks?: number;
}

export interface SeasonRace extends SeasonRaceInput {
  index: number;
  /** Season-global, 1-based. */
  week_number: number;
  /** True when this race anchors a macrocycle (gets a real taper). */
  is_anchor: boolean;
}

export interface SeasonBlock {
  sort_order: number;
  kind: SeasonBlockKind;
  start_week: number;
  end_week: number;
  weeks: number;
  start_date: string;
  end_date: string;
  /** Volume relative to the athlete's normal training week. */
  volume_multiplier: number;
  /** One sentence, user-facing: why this block exists here (PP1). */
  focus: string;
  /** The sessions that define the block — what the weeks are made of. */
  key_sessions: string[];
  /** Weaknesses this block is the right place to work on. */
  weakness_targets: string[];
  /** Season-global week numbers inside this block that run at -35%. */
  deload_weeks: number[];
  /** Races that fall inside this block (indexes into SeasonPlan.races). */
  race_indexes: number[];
}

export interface SeasonMacrocycle {
  sort_order: number;
  label: string;
  /** Index of the race this cycle builds towards; null for an open tail. */
  target_race_index: number | null;
  start_week: number;
  end_week: number;
  start_date: string;
  end_date: string;
  blocks: SeasonBlock[];
}

export interface SeasonPlan {
  start_date: string;
  end_date: string;
  total_weeks: number;
  races: SeasonRace[];
  macrocycles: SeasonMacrocycle[];
  /** Every deload week in the season, season-global week numbers. */
  deload_weeks: number[];
  /** Plain-language notes about decisions a coach would have to explain. */
  notes: string[];
}

// ── Date helpers (UTC only — a season must not shift with a timezone) ───────

const DAY_MS = 86_400_000;

function utcDate(iso: string): Date {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${iso}`);
  return d;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Monday of the week containing d — the season grid is week-based. */
function mondayOf(d: Date): Date {
  const dow = d.getUTCDay(); // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return addDays(d, -backToMonday);
}

// ── Weakness classification (deterministic keyword match) ───────────────────

type WeaknessCategory = "strength" | "metabolic" | "race_execution" | "running" | "technique" | "general";

const WEAKNESS_RULES: { pattern: RegExp; category: WeaknessCategory }[] = [
  { pattern: /sled|schlitten|push|pull/i, category: "strength" },
  { pattern: /wall ?ball|wallball/i, category: "race_execution" },
  { pattern: /laktat|lactate|schwelle|threshold|vo2|tolerance/i, category: "metabolic" },
  { pattern: /lauf|run|5k|10k|pace|tempo|compromised/i, category: "running" },
  { pattern: /grip|griff|farmer|carry/i, category: "strength" },
  { pattern: /burpee|broad ?jump/i, category: "race_execution" },
  { pattern: /lunge|ausfall|sandbag|squat|kraft|strength|deadlift/i, category: "strength" },
  { pattern: /row|rudern|ski|erg/i, category: "technique" },
  { pattern: /technik|technique|form|effizienz|efficiency|transition|roxzone/i, category: "technique" },
  { pattern: /ausdauer|endurance|aerob|aerobic|zone ?2/i, category: "metabolic" },
];

export function classifyWeakness(weakness: string): WeaknessCategory {
  for (const rule of WEAKNESS_RULES) {
    if (rule.pattern.test(weakness)) return rule.category;
  }
  return "general";
}

/** Which weakness categories each block kind is the right place for. */
const BLOCK_TARGETS: Record<SeasonBlockKind, WeaknessCategory[]> = {
  post_race_recovery: [],
  base: ["strength", "technique", "general"],
  build: ["metabolic", "running", "general"],
  race_specific: ["race_execution", "running"],
  bridge: ["strength", "metabolic", "race_execution", "running", "technique", "general"],
  taper: [],
  open_base: ["strength", "technique", "general"],
};

function targetsFor(kind: SeasonBlockKind, weaknesses: string[]): string[] {
  const wanted = BLOCK_TARGETS[kind];
  if (!wanted.length) return [];
  return weaknesses.filter((w) => wanted.includes(classifyWeakness(w)));
}

// ── Block copy ──────────────────────────────────────────────────────────────

const KEY_SESSIONS: Record<SeasonBlockKind, string[]> = {
  post_race_recovery: [
    "Reverse taper: easy movement first, load returns gradually",
    "Deload volume, no intensity targets",
    "Race analysis — splits, roxzone, where the time went",
  ],
  base: [
    "Zone 2 running volume",
    "Heavy strength, 3-5 reps",
    "Movement efficiency and station technique at controlled intensity",
  ],
  build: [
    "VO2max intervals",
    "Lactate-tolerance work",
    "Threshold running",
    "Strength-endurance EMOMs",
  ],
  race_specific: [
    "Compromised running (run → station → run)",
    "Pacing simulations at goal split",
    "Brick sessions and full race simulations",
  ],
  bridge: [
    "Weakness correction — the stations that cost you time",
    "Re-build: one strength and one threshold session per week",
    "One compromised-running session to hold race feel",
  ],
  taper: [
    "Volume down ~40%, intensity stays sharp",
    "Short race-pace touches, full recovery between",
    "Rehearse the race day: nutrition, warm-up, transitions",
  ],
  open_base: [
    "Zone 2 volume and heavy strength",
    "Technique work on the stations you avoid",
    "No race on the calendar — build the engine, stay healthy",
  ],
};

function focusFor(kind: SeasonBlockKind, ctx: { raceType?: string; weeks: number }): string {
  switch (kind) {
    case "post_race_recovery":
      return `Recover from the race and let the adaptations land — ${ctx.weeks} week(s) of reverse taper before any real load returns.`;
    case "base":
      return "Aerobic base and heavy strength. The engine and the raw force that everything later is built on.";
    case "build":
      return "Raise the ceiling: VO2max, lactate tolerance and strength endurance under fatigue.";
    case "race_specific":
      return `Make it race-shaped — compromised running and pacing at ${ctx.raceType ?? "race"} effort, so nothing on race day is new.`;
    case "bridge":
      return "Short gap between races: correct the weaknesses that cost you time, re-build, and hold race feel.";
    case "taper":
      return "Cut volume, keep intensity crisp. Arrive fresh — taper is never negotiable.";
    case "open_base":
      return "No race booked yet: build base and strength so the next cycle starts from a higher floor.";
  }
}

// ── Cycle allocation ────────────────────────────────────────────────────────

interface CycleAllocation {
  post_race_recovery: number;
  base: number;
  build: number;
  race_specific: number;
  bridge: number;
  taper: number;
}

const EMPTY_ALLOCATION: CycleAllocation = {
  post_race_recovery: 0,
  base: 0,
  build: 0,
  race_specific: 0,
  bridge: 0,
  taper: 0,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Split one race cycle backwards from the race. Everything is derived from
 * SEASON_TUNING; the collapse order when weeks are short is taper (protected),
 * then race-specific, then build, then base.
 */
export function allocateCycle(opts: {
  weeks: number;
  priority: RacePriority;
  /** Priority of the race that just happened, when this cycle follows one. */
  previousRacePriority?: RacePriority | null;
}): CycleAllocation {
  const T = SEASON_TUNING;
  const weeks = Math.max(1, Math.floor(opts.weeks));
  const alloc: CycleAllocation = { ...EMPTY_ALLOCATION };

  // 1) Post-race recovery, only when a race precedes this cycle. It never eats
  //    the taper: at least two weeks stay for sharpening + taper.
  if (opts.previousRacePriority) {
    const wanted = T.recovery_weeks[opts.previousRacePriority];
    alloc.post_race_recovery = clamp(wanted, 0, Math.max(0, weeks - 2));
  }
  let remaining = weeks - alloc.post_race_recovery;

  // 2) Taper: protected first (PP4). Two weeks only for a long A-race cycle.
  const wantsLongTaper = opts.priority === "A" && weeks >= T.taper_long_cycle_min_weeks;
  alloc.taper = Math.min(
    wantsLongTaper ? T.taper_weeks_long : T.taper_weeks_short,
    Math.max(1, remaining),
  );
  remaining -= alloc.taper;
  if (remaining <= 0) return alloc;

  // 3) A short gap after a race is one re-build bridge, not three tiny blocks.
  if (opts.previousRacePriority && remaining <= T.bridge_max_weeks) {
    alloc.bridge = remaining;
    return alloc;
  }

  // 4) Backward split of what is left.
  const share = clamp(
    Math.floor(remaining * T.race_specific_share),
    remaining >= T.race_specific_full_from_weeks
      ? T.race_specific_full_min_weeks
      : T.race_specific_min_weeks,
    T.race_specific_max_weeks,
  );
  const rs = Math.min(share, remaining);
  alloc.race_specific = rs;
  const afterRs = remaining - rs;
  const build = Math.min(
    clamp(Math.floor(afterRs * T.build_share), T.build_min_weeks, T.build_max_weeks),
    afterRs,
  );
  alloc.build = build;
  alloc.base = afterRs - build;
  return alloc;
}

// ── The season planner ──────────────────────────────────────────────────────

const BLOCK_ORDER: SeasonBlockKind[] = [
  "post_race_recovery",
  "base",
  "build",
  "race_specific",
  "bridge",
  "taper",
];

export function planSeason(input: SeasonInput): SeasonPlan {
  const T = SEASON_TUNING;
  const notes: string[] = [];
  const weaknesses = (input.weaknesses ?? []).map((w) => w.trim()).filter(Boolean);

  const startDate = utcDate(input.startDate);
  const anchorMonday = mondayOf(startDate);
  const weekOf = (d: Date) => Math.floor((mondayOf(d).getTime() - anchorMonday.getTime()) / (7 * DAY_MS)) + 1;
  const weekStart = (week: number) => addDays(anchorMonday, (week - 1) * 7);
  const weekEnd = (week: number) => addDays(anchorMonday, (week - 1) * 7 + 6);

  // ── Races: sorted, past ones dropped, mapped onto the week grid ──────────
  const parsed = input.races
    .map((r) => ({ ...r, at: utcDate(r.date) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const dropped = parsed.filter((r) => weekOf(r.at) < 1);
  if (dropped.length) {
    notes.push(
      `${dropped.length} race(s) before the season start were ignored (${dropped.map((r) => r.date).join(", ")}).`,
    );
  }
  const upcoming = parsed.filter((r) => weekOf(r.at) >= 1);

  const races: SeasonRace[] = upcoming.map((r, i) => ({
    index: i,
    date: r.date,
    type: r.type,
    priority: r.priority,
    week_number: weekOf(r.at),
    is_anchor: false,
  }));

  // ── Which races anchor a macrocycle (i.e. get a real taper) ──────────────
  let anchors = races.filter((r) => r.priority === "A");
  if (!anchors.length && races.length) {
    const last = races[races.length - 1];
    last.is_anchor = true;
    anchors = [last];
    notes.push(
      `No A race given — "${last.type}" on ${last.date} is treated as the season's A race and gets the full taper.`,
    );
  } else {
    anchors.forEach((a) => {
      a.is_anchor = true;
    });
  }

  // Two anchors in the same week would produce a zero-length cycle.
  const anchorWeeks = new Set<number>();
  const usableAnchors: SeasonRace[] = [];
  for (const a of anchors) {
    if (anchorWeeks.has(a.week_number)) {
      a.is_anchor = false;
      notes.push(`"${a.type}" (${a.date}) shares its week with another A race — kept as a same-day second start.`);
      continue;
    }
    anchorWeeks.add(a.week_number);
    usableAnchors.push(a);
  }

  const horizonWeeks = Math.max(1, Math.floor(input.horizonWeeks ?? T.default_horizon_weeks));
  const lastAnchorWeek = usableAnchors.length ? usableAnchors[usableAnchors.length - 1].week_number : 0;
  const totalWeeks = Math.max(horizonWeeks, lastAnchorWeek + T.recovery_weeks.A);

  // ── One macrocycle per anchor race, plus an open tail ────────────────────
  const macrocycles: SeasonMacrocycle[] = [];
  const allDeloads: number[] = [];
  let cursor = 1;
  let previousPriority: RacePriority | null = null;

  usableAnchors.forEach((race, i) => {
    const cycleWeeks = race.week_number - cursor + 1;
    if (cycleWeeks <= 0) return;

    const alloc = allocateCycle({
      weeks: cycleWeeks,
      priority: race.priority,
      previousRacePriority: previousPriority,
    });

    if (alloc.bridge > 0) {
      notes.push(
        `Only ${cycleWeeks} week(s) between the previous race and "${race.type}" (${race.date}) — planned as recovery + re-build bridge + taper, not a full cycle.`,
      );
    }
    if (alloc.base === 0 && alloc.bridge === 0 && cycleWeeks < 12) {
      notes.push(
        `The cycle into "${race.type}" (${race.date}) is ${cycleWeeks} weeks — too short for a base block, so it starts straight into build work.`,
      );
    }

    const { blocks, deloads } = layoutBlocks({
      alloc,
      startWeek: cursor,
      endWeek: race.week_number,
      weaknesses,
      raceType: race.type,
      weekStart,
      weekEnd,
      races,
    });
    allDeloads.push(...deloads);

    macrocycles.push({
      sort_order: i,
      label: `Race cycle ${i + 1} — ${race.type}, ${race.date}`,
      target_race_index: race.index,
      start_week: cursor,
      end_week: race.week_number,
      start_date: iso(weekStart(cursor)),
      end_date: iso(weekEnd(race.week_number)),
      blocks,
    });

    cursor = race.week_number + 1;
    previousPriority = race.priority;
  });

  // ── Tail: recovery after the last race, then open base to the horizon ────
  if (cursor <= totalWeeks) {
    const tailBlocks: SeasonBlock[] = [];
    const tailStart = cursor;
    let tailCursor = cursor;
    let sort = 0;

    if (previousPriority) {
      const recovery = Math.min(T.recovery_weeks[previousPriority], totalWeeks - tailCursor + 1);
      if (recovery > 0) {
        tailBlocks.push(
          makeBlock({
            sort_order: sort++,
            kind: "post_race_recovery",
            startWeek: tailCursor,
            weeks: recovery,
            weaknesses,
            weekStart,
            weekEnd,
            races,
          }),
        );
        tailCursor += recovery;
      }
    }

    if (tailCursor <= totalWeeks) {
      const openWeeks = totalWeeks - tailCursor + 1;
      const block = makeBlock({
        sort_order: sort++,
        kind: "open_base",
        startWeek: tailCursor,
        weeks: openWeeks,
        weaknesses,
        weekStart,
        weekEnd,
        races,
      });
      block.deload_weeks = placeDeloads([block], block.end_week + 1);
      allDeloads.push(...block.deload_weeks);
      tailBlocks.push(block);
      notes.push(
        `No race after week ${cursor - 1}: the remaining ${openWeeks} week(s) stay an open base block. Add the next race and the season re-plans from there.`,
      );
    }

    if (tailBlocks.length) {
      macrocycles.push({
        sort_order: macrocycles.length,
        label: previousPriority ? "After the last race — recover and re-build" : "Open season — no race booked",
        target_race_index: null,
        start_week: tailStart,
        end_week: totalWeeks,
        start_date: iso(weekStart(tailStart)),
        end_date: iso(weekEnd(totalWeeks)),
        blocks: tailBlocks,
      });
    }
  }

  // ── Notes for the races that ride inside a block (B/C tune-ups) ──────────
  for (const r of races) {
    if (r.is_anchor) continue;
    const block = findBlock(macrocycles, r.week_number);
    notes.push(
      `"${r.type}" (${r.date}, priority ${r.priority}) sits in week ${r.week_number}${
        block ? ` inside the ${blockLabel(block.kind)} block` : ""
      } — treat it as a hard training day: three easy days before, no taper, back to the plan after.`,
    );
  }

  return {
    start_date: iso(anchorMonday),
    end_date: iso(weekEnd(totalWeeks)),
    total_weeks: totalWeeks,
    races,
    macrocycles,
    deload_weeks: [...new Set(allDeloads)].sort((a, b) => a - b),
    notes,
  };
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function makeBlock(opts: {
  sort_order: number;
  kind: SeasonBlockKind;
  startWeek: number;
  weeks: number;
  weaknesses: string[];
  raceType?: string;
  weekStart: (w: number) => Date;
  weekEnd: (w: number) => Date;
  races: SeasonRace[];
}): SeasonBlock {
  const endWeek = opts.startWeek + opts.weeks - 1;
  return {
    sort_order: opts.sort_order,
    kind: opts.kind,
    start_week: opts.startWeek,
    end_week: endWeek,
    weeks: opts.weeks,
    start_date: iso(opts.weekStart(opts.startWeek)),
    end_date: iso(opts.weekEnd(endWeek)),
    volume_multiplier: SEASON_TUNING.volume[opts.kind],
    focus: focusFor(opts.kind, { raceType: opts.raceType, weeks: opts.weeks }),
    key_sessions: KEY_SESSIONS[opts.kind],
    weakness_targets: targetsFor(opts.kind, opts.weaknesses),
    deload_weeks: [],
    race_indexes: opts.races
      .filter((r) => r.week_number >= opts.startWeek && r.week_number <= endWeek)
      .map((r) => r.index),
  };
}

function layoutBlocks(opts: {
  alloc: CycleAllocation;
  startWeek: number;
  endWeek: number;
  weaknesses: string[];
  raceType: string;
  weekStart: (w: number) => Date;
  weekEnd: (w: number) => Date;
  races: SeasonRace[];
}): { blocks: SeasonBlock[]; deloads: number[] } {
  const blocks: SeasonBlock[] = [];
  let cursor = opts.startWeek;
  let sort = 0;

  for (const kind of BLOCK_ORDER) {
    const weeks = opts.alloc[kind as keyof CycleAllocation];
    if (!weeks) continue;
    blocks.push(
      makeBlock({
        sort_order: sort++,
        kind,
        startWeek: cursor,
        weeks,
        weaknesses: opts.weaknesses,
        raceType: opts.raceType,
        weekStart: opts.weekStart,
        weekEnd: opts.weekEnd,
        races: opts.races,
      }),
    );
    cursor += weeks;
  }

  const deloads = placeDeloads(blocks, opts.endWeek - opts.alloc.taper);
  for (const b of blocks) {
    b.deload_weeks = deloads.filter((w) => w >= b.start_week && w <= b.end_week);
  }
  return { blocks, deloads };
}

/**
 * Every 4th TRAINING week of a cycle runs at -35%. Recovery blocks are already
 * light and a taper is not a place to deload, so neither counts. Two coaching
 * corrections on top of the plain count: a deload never lands on the opening
 * week of a block (it moves to the last week of the block before, which is
 * where a coach would put it anyway), and the sharpening week right before the
 * taper is never a deload.
 */
function placeDeloads(blocks: SeasonBlock[], lastSharpeningWeek: number): number[] {
  const trainingBlocks = blocks.filter(
    (b) => b.kind !== "post_race_recovery" && b.kind !== "taper",
  );
  const weeks: { week: number; isBlockStart: boolean }[] = [];
  for (const b of trainingBlocks) {
    for (let w = b.start_week; w <= b.end_week; w++) {
      weeks.push({ week: w, isBlockStart: w === b.start_week });
    }
  }

  const out: number[] = [];
  for (let i = SEASON_TUNING.deload_every_n_weeks - 1; i < weeks.length; i += SEASON_TUNING.deload_every_n_weeks) {
    const entry = weeks[i];
    // Opening week of a block → shift to the last week of the previous block.
    const candidate = entry.isBlockStart && i > 0 ? weeks[i - 1].week : entry.week;
    if (candidate >= lastSharpeningWeek) continue; // taper does that job
    if (!out.includes(candidate)) out.push(candidate);
  }
  return out;
}

function blockLabel(kind: SeasonBlockKind): string {
  return kind.replace(/_/g, " ");
}

function findBlock(macrocycles: SeasonMacrocycle[], week: number): SeasonBlock | undefined {
  for (const m of macrocycles) {
    const b = m.blocks.find((x) => week >= x.start_week && week <= x.end_week);
    if (b) return b;
  }
  return undefined;
}

/**
 * Which season week a date falls in, 1-based. One definition, used by the
 * engine and by the season page's "you are here" marker.
 */
export function seasonWeekOf(seasonStartDate: string, date: string): number {
  const start = utcDate(seasonStartDate);
  return Math.floor((mondayOf(utcDate(date)).getTime() - start.getTime()) / (7 * DAY_MS)) + 1;
}

/** Where the athlete is right now — drives the "you are here" marker. */
export function currentSeasonBlock(
  season: SeasonPlan,
  today: string,
): { macrocycle: SeasonMacrocycle; block: SeasonBlock; week_number: number } | null {
  const week = seasonWeekOf(season.start_date, today);
  if (week < 1 || week > season.total_weeks) return null;
  for (const m of season.macrocycles) {
    const block = m.blocks.find((b) => week >= b.start_week && week <= b.end_week);
    if (block) return { macrocycle: m, block, week_number: week };
  }
  return null;
}

/**
 * The race the detailed 4-20 week plan should currently be built for: the next
 * anchor race that is still far enough out to plan a cycle to.
 */
export function nextAnchorRace(season: SeasonPlan, today: string): SeasonRace | null {
  const todayDate = utcDate(today);
  return (
    season.races.find((r) => r.is_anchor && utcDate(r.date).getTime() >= todayDate.getTime()) ?? null
  );
}
