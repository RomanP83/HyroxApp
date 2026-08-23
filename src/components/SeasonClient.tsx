"use client";

// ============================================================================
// The year view: macrocycles as a timeline, mesocycles as blocks, and the
// calendar that produced them. Editing the races regenerates the whole season
// (the planner is deterministic — same calendar, same year plan).
// ============================================================================
import { useEffect, useState } from "react";
import { readApi } from "@/lib/apiResult";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PALETTE, SEASON_BLOCK_COLORS, titleCase } from "@/lib/format";
import { AppHeader } from "./AppHeader";
import { SeasonCalendar } from "./SeasonCalendar";
import { SparkIcon, SpinnerIcon, TargetIcon } from "./icons";

export interface SeasonRaceRow {
  race_date: string;
  race_type: string;
  priority: "A" | "B" | "C";
  week_number: number;
  is_anchor: boolean;
}

export interface SeasonBlockRow {
  macrocycle_sort: number;
  macrocycle_label: string;
  target_race_index: number | null;
  sort_order: number;
  kind: string;
  start_week: number;
  end_week: number;
  weeks: number;
  start_date: string;
  end_date: string;
  volume_multiplier: number;
  focus: string;
  key_sessions: string[];
  weakness_targets: string[];
  deload_weeks: number[];
}

export interface SeasonData {
  start_date: string;
  end_date: string;
  total_weeks: number;
  notes: string[];
  races: SeasonRaceRow[];
  blocks: SeasonBlockRow[];
}

interface RaceDraft {
  date: string;
  type: string;
  priority: "A" | "B" | "C";
}

interface Props {
  season: SeasonData | null;
  weaknesses: string[];
  /** Race date of the athlete's active weekly plan, if any. */
  activePlanRaceDate: string | null;
  currentWeek: number | null;
  /** Today, resolved on the server so the calendar renders identically. */
  today: string;
}

/**
 * What each priority actually does to the training — the same rules the engine
 * applies (season.ts builds the cycle, raceCalendar.ts bends the days).
 */
/** A race's priority is a promise about the training around it — so it is a
 *  signal colour, on the same scale the week view uses for effort. */
const PRIORITY_COLORS: Record<RaceDraft["priority"], string> = {
  A: PALETTE.flame,
  B: PALETTE.amber,
  C: PALETTE.smoke,
};

const PRIORITY_INFO: Record<RaceDraft["priority"], { label: string; effect: string }> = {
  A: {
    label: "A — Main race",
    effect: "Gets its own macrocycle: a full taper before it and 2-3 recovery weeks after.",
  },
  B: {
    label: "B — Secondary race",
    effect: "Rides inside the block: 3 easy days before, 2 after, the week at 80% volume. No cycle of its own.",
  },
  C: {
    label: "C — Tune-up",
    effect: "No taper. It replaces the week's hard session, then one easy day.",
  },
};

const EMPTY_RACE: RaceDraft = { date: "", type: "Hyrox Open", priority: "A" };

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function SeasonClient(props: Props) {
  const router = useRouter();
  const [races, setRaces] = useState<RaceDraft[]>(
    props.season?.races.length
      ? props.season.races.map((r) => ({
          date: r.race_date,
          type: r.race_type,
          priority: r.priority,
        }))
      : [{ ...EMPTY_RACE }],
  );
  const [weaknessText, setWeaknessText] = useState(props.weaknesses.join(", "));
  const [busy, setBusy] = useState(false);
  // Thirteen months of mostly empty grid buries the year it is meant to
  // support. Four months is the horizon an athlete acts on; the rest is a tap.
  const [allMonths, setAllMonths] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function generate() {
    const cleaned = races.filter((r) => r.date && r.type.trim());
    if (!cleaned.length) {
      setToast("Add at least one race — the year is planned backwards from it.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/seasons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          races: cleaned,
          weaknesses: weaknessText
            .split(",")
            .map((w) => w.trim())
            .filter(Boolean),
        }),
      });
      const out = await readApi(res);
      if (!out.ok) throw new Error(out.message);
      const data = out.data as Record<string, any>;
      setToast("Year plan rebuilt — every block is explained below.");
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not build the season.");
    } finally {
      setBusy(false);
    }
  }

  /** Turn the calendar into the detailed 4-20 week plan for the next main race. */
  async function buildPlan() {
    setBusy(true);
    try {
      const res = await fetch("/api/plans/from-season", { method: "POST" });
      const out = await readApi(res);
      if (!out.ok) throw new Error(out.message);
      const data = out.data as Record<string, any>;
      setToast(
        `Training plan built: ${data.weeksToRace} weeks to ${data.main_race.type}` +
          (data.supporting_races ? `, with ${data.supporting_races} race(s) inside it.` : "."),
      );
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not build the plan.");
    } finally {
      setBusy(false);
    }
  }

  const season = props.season;
  const macrocycles = groupByMacrocycle(season?.blocks ?? []);
  const mainRaceHint = hintForMainRaces(races);

  // Days to the next race that anchors a cycle. A client fact: resolving it
  // during render would make the server and the browser disagree.
  const [daysToMain, setDaysToMain] = useState<number | null>(null);
  useEffect(() => {
    const next = (props.season?.races ?? [])
      .filter((r) => r.is_anchor && r.race_date >= props.today)
      .sort((a, b) => a.race_date.localeCompare(b.race_date))[0];
    if (!next) return setDaysToMain(null);
    const now = new Date();
    const midnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const race = new Date(`${next.race_date.slice(0, 10)}T00:00:00Z`).getTime();
    setDaysToMain(Math.max(0, Math.round((race - midnight) / 86_400_000)));
  }, [props.season, props.today]);

  const raceEditor = (
    <div className="card space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-micro font-semibold uppercase tracking-widest text-ash">
          Your races
        </span>
        <span className="text-meta text-smoke">
          {races.filter((r) => r.date).length} in the calendar
        </span>
      </div>

      <div className="space-y-3">
        {races.map((race, i) => (
          <div key={i} className="rounded-control border border-edge bg-well/60 p-3">
            <div className="grid gap-2 sm:grid-cols-[150px_1fr_190px_40px]">
              <input
                className="input"
                type="date"
                aria-label="Race date"
                value={race.date}
                onChange={(e) => setRaces(patch(races, i, { date: e.target.value }))}
              />
              <input
                className="input"
                aria-label="Race name"
                value={race.type}
                placeholder="Hyrox Open Men"
                onChange={(e) => setRaces(patch(races, i, { type: e.target.value }))}
              />
              <select
                className="input"
                aria-label="Priority"
                value={race.priority}
                onChange={(e) =>
                  setRaces(patch(races, i, { priority: e.target.value as RaceDraft["priority"] }))
                }
              >
                {(["A", "B", "C"] as const).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_INFO[p].label}
                  </option>
                ))}
              </select>
              <button
                className="btn-quiet"
                aria-label="Remove race"
                onClick={() => setRaces(races.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
            <p className="mt-2 flex items-start gap-2 text-meta leading-relaxed text-ash">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: PRIORITY_COLORS[race.priority] }}
              />
              {PRIORITY_INFO[race.priority].effect}
            </p>
          </div>
        ))}
      </div>

      <button className="btn-ghost" onClick={() => setRaces([...races, { ...EMPTY_RACE }])}>
        + Add a race
      </button>

      <div className="border-t border-edge pt-4">
        <label className="label" htmlFor="weaknesses">
          Your weaknesses
        </label>
        <input
          id="weaknesses"
          className="input"
          value={weaknessText}
          placeholder="Sled Push, Laktattoleranz, Wall Balls"
          onChange={(e) => setWeaknessText(e.target.value)}
        />
        <p className="mt-2 text-meta leading-relaxed text-ash">
          Each one is routed to the block where it belongs — strength work into base, lactate
          tolerance into build, race execution into the race-specific block.
        </p>
      </div>

      {mainRaceHint && (
        <p className="border-l-2 border-amber/50 pl-3 text-meta leading-relaxed text-bone">
          {mainRaceHint}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-edge pt-4">
        <button className="btn-primary" onClick={() => void generate()} disabled={busy}>
          {busy ? <SpinnerIcon size={16} /> : <SparkIcon size={16} />}
          {season ? "Rebuild the year" : "Build my year plan"}
        </button>
        {season && (
          <button className="btn-ghost" onClick={() => void buildPlan()} disabled={busy}>
            <TargetIcon size={16} />
            Build the training plan
          </button>
        )}
      </div>
      <p className="text-micro leading-relaxed text-ash">
        One main race is what a year is planned around. Add as many secondary races as you like —
        they are trained through, not tapered for.
      </p>
    </div>
  );

  return (
    <main className="space-y-6">
      <AppHeader countdown={{ label: "Next main race", days: daysToMain }} />

      {!season ? (
        <>
          <div>
            <h1 className="text-h1 font-bold tracking-tight">Your season</h1>
            <p className="mt-2 max-w-[62ch] text-lead leading-relaxed text-bone">
              The year above the week view. Give it your races and it plans backwards from each main
              one: taper first, then the race-specific block, then the build — base gets what is
              left.
            </p>
          </div>
          {raceEditor}
        </>
      ) : (
        <>
          {/* ── The year, as one continuous run of blocks. The focal element:
                 everything else on this page explains it. ─────────────────── */}
          <div className="card-focal space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h1 className="text-h2 font-bold tracking-tight">
                {season.total_weeks} weeks to plan
              </h1>
              <span className="font-mono text-meta tabular-nums text-ash">
                {fmtDate(season.start_date)} → {fmtDate(season.end_date)}
              </span>
            </div>

            <div className="space-y-3">
              {macrocycles.map((m) => {
                const first = m.blocks[0];
                const last = m.blocks[m.blocks.length - 1];
                const weeks = last.end_week - first.start_week + 1;
                const cycleRaces = season.races.filter(
                  (r) => r.week_number >= first.start_week && r.week_number <= last.end_week,
                );
                return (
                  <div key={m.sort}>
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-base font-semibold text-chalk">{m.label}</span>
                      <span className="font-mono text-micro tabular-nums text-smoke">
                        W{first.start_week}–{last.end_week}
                      </span>
                    </div>
                    <div className="flex h-7 gap-[2px] overflow-hidden rounded-control">
                      {m.blocks.map((b) => (
                        <div
                          key={b.sort_order}
                          title={`${titleCase(b.kind)} · week ${b.start_week}–${b.end_week} · volume ${Math.round(
                            b.volume_multiplier * 100,
                          )}%`}
                          className="relative flex items-center justify-center overflow-hidden"
                          style={{ flexGrow: b.weeks, flexBasis: 0 }}
                        >
                          <div
                            className="absolute inset-0"
                            style={{
                              background: SEASON_BLOCK_COLORS[b.kind] ?? "#3b4653",
                              opacity: isCurrent(b, props.currentWeek) ? 0.95 : 0.4,
                            }}
                          />
                          {b.weeks >= 2 && (
                            <span
                              className={`relative font-mono text-micro font-bold ${
                                isCurrent(b, props.currentWeek) ? "text-floor" : "text-bone"
                              }`}
                            >
                              {b.weeks}W
                            </span>
                          )}
                          {isCurrent(b, props.currentWeek) && (
                            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-chalk" />
                          )}
                        </div>
                      ))}
                    </div>
                    {cycleRaces.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                        {cycleRaces.map((r) => (
                          <span
                            key={`${r.race_date}-${r.race_type}`}
                            className="flex items-center gap-1.5 text-meta"
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: PRIORITY_COLORS[r.priority] }}
                            />
                            <span className={r.is_anchor ? "text-chalk" : "text-ash"}>
                              {r.race_type}
                            </span>
                            <span className="font-mono text-micro text-smoke">
                              {fmtDate(r.race_date)}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-edge pt-3">
              {Object.entries(SEASON_BLOCK_COLORS).map(([kind, color]) => (
                <span key={kind} className="flex items-center gap-1.5 text-micro text-ash">
                  <span className="h-1.5 w-3 rounded-full" style={{ background: color }} />
                  {titleCase(kind)}
                </span>
              ))}
            </div>
          </div>

          {/* ── The months, with the races on the days they happen. ───────── */}
          <div className="card space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-micro font-semibold uppercase tracking-widest text-ash">
                Calendar
              </span>
              <span className="text-meta text-smoke">
                Click a day to add a race · a filled day is a race
              </span>
            </div>
            <SeasonCalendar
              startDate={allMonths ? season.start_date : props.today}
              endDate={season.end_date}
              today={props.today}
              blocks={season.blocks}
              races={season.races}
              maxMonths={allMonths ? 14 : 4}
              onPickDate={(day) =>
                setRaces((prev) =>
                  prev.some((r) => r.date === day)
                    ? prev
                    : [...prev.filter((r) => r.date), { ...EMPTY_RACE, date: day, priority: "B" }],
                )
              }
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-[52ch] text-meta leading-relaxed text-ash">
                A day you add here becomes a secondary race — change it to a main race below if the
                year should be planned around it, then rebuild.
              </p>
              <button className="btn-quiet" onClick={() => setAllMonths((v) => !v)}>
                {allMonths ? "Show the next months only" : `Show all ${season.total_weeks} weeks`}
              </button>
            </div>
          </div>

          {/* ── Blocks as a list, not a wall of identical cards. ──────────── */}
          {macrocycles.map((m) => (
            <div key={`detail-${m.sort}`} className="space-y-2">
              <h2 className="text-micro font-semibold uppercase tracking-widest text-ash">
                {m.label}
              </h2>
              <div className="space-y-1.5">
                {m.blocks.map((b) => {
                  const now = isCurrent(b, props.currentWeek);
                  return (
                    <details
                      key={b.sort_order}
                      className={`group rounded-panel border p-3.5 ${
                        now ? "border-edge-strong bg-rack" : "border-transparent bg-lane/60"
                      }`}
                    >
                      <summary className="flex cursor-pointer list-none items-start gap-3">
                        <span
                          className="rail mt-1 h-4"
                          style={{ color: SEASON_BLOCK_COLORS[b.kind] ?? "#3b4653" }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                            <span className="text-lead font-semibold text-chalk">
                              {titleCase(b.kind)}
                            </span>
                            {now && <span className="pill text-flame">now</span>}
                            <span className="font-mono text-micro tabular-nums text-smoke">
                              W{b.start_week}–{b.end_week} · {b.weeks}W ·{" "}
                              {Math.round(b.volume_multiplier * 100)}% vol
                              {b.deload_weeks.length > 0 && ` · deload W${b.deload_weeks.join(", W")}`}
                            </span>
                          </span>
                          <span className="mt-1 block text-meta leading-relaxed text-bone">
                            {b.focus}
                          </span>
                        </span>
                        <span className="mt-1 shrink-0 text-smoke transition-transform duration-200 group-open:rotate-90">
                          ▸
                        </span>
                      </summary>
                      <div className="mt-3 space-y-2 border-t border-edge pl-6 pt-3">
                        <ul className="space-y-1">
                          {b.key_sessions.map((sess) => (
                            <li key={sess} className="text-meta text-ash">
                              {sess}
                            </li>
                          ))}
                        </ul>
                        {b.weakness_targets.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {b.weakness_targets.map((w) => (
                              <span key={w} className="pill text-amber">
                                {w}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="font-mono text-micro text-smoke">
                          {fmtDate(b.start_date)} → {fmtDate(b.end_date)}
                        </p>
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── Why the planner did what it did — the same feed pattern the
                 week view uses for engine decisions. ──────────────────────── */}
          {season.notes.length > 0 && (
            <div className="card">
              <div className="mb-2.5 flex items-center gap-2">
                <SparkIcon size={15} className="text-amber" />
                <span className="text-micro font-semibold uppercase tracking-widest text-ash">
                  How this year was planned
                </span>
              </div>
              <ul className="space-y-2.5">
                {season.notes.map((n, i) => (
                  <li
                    key={i}
                    className="border-l-2 border-amber/40 pl-3 text-meta leading-relaxed text-bone"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {raceEditor}

          <p className="text-meta leading-relaxed text-ash">
            The week view builds the detailed sessions for the race cycle you are in
            {props.activePlanRaceDate
              ? ` (currently ${fmtDate(props.activePlanRaceDate)}).`
              : " — no weekly plan is active yet."}{" "}
            The year plan above is the map;{" "}
            <Link href="/plan" className="text-flame underline">
              this week
            </Link>{" "}
            is the terrain.
          </p>
        </>
      )}

      {toast && (
        <div
          className="animate-pop-in fixed bottom-4 left-1/2 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-control border border-edge-strong bg-rack px-4 py-2.5 text-base"
          onClick={() => setToast(null)}
        >
          <SparkIcon size={14} className="shrink-0 text-amber" />
          {toast}
        </div>
      )}
    </main>
  );
}

/**
 * A season needs exactly one race it is built around. None means the planner
 * has to guess; several means several cycles, which is legal but rarely what
 * someone means when they enter three races in one spring.
 */
function hintForMainRaces(races: RaceDraft[]): string | null {
  const dated = races.filter((r) => r.date);
  if (!dated.length) return null;
  const mains = dated.filter((r) => r.priority === "A");
  if (!mains.length) {
    return "No main race yet — the last race in the list will be treated as the A race and get the full taper. Mark the one that actually matters.";
  }
  if (mains.length > 1) {
    return `${mains.length} main races: each gets its own cycle with a taper and recovery weeks around it. If two of them are close together, make the second one a secondary race instead.`;
  }
  return null;
}

function patch(races: RaceDraft[], i: number, values: Partial<RaceDraft>): RaceDraft[] {
  return races.map((r, idx) => (idx === i ? { ...r, ...values } : r));
}

function isCurrent(block: SeasonBlockRow, currentWeek: number | null): boolean {
  return currentWeek != null && currentWeek >= block.start_week && currentWeek <= block.end_week;
}

function groupByMacrocycle(blocks: SeasonBlockRow[]) {
  const map = new Map<number, { sort: number; label: string; blocks: SeasonBlockRow[] }>();
  for (const b of [...blocks].sort((a, b2) =>
    a.macrocycle_sort === b2.macrocycle_sort
      ? a.sort_order - b2.sort_order
      : a.macrocycle_sort - b2.macrocycle_sort,
  )) {
    const entry = map.get(b.macrocycle_sort) ?? {
      sort: b.macrocycle_sort,
      label: b.macrocycle_label,
      blocks: [],
    };
    entry.blocks.push(b);
    map.set(b.macrocycle_sort, entry);
  }
  return [...map.values()];
}
