"use client";

// ============================================================================
// The year view: macrocycles as a timeline, mesocycles as blocks, and the
// calendar that produced them. Editing the races regenerates the whole season
// (the planner is deterministic — same calendar, same year plan).
// ============================================================================
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SEASON_BLOCK_COLORS, titleCase } from "@/lib/format";
import { CalendarIcon, ChartIcon, SparkIcon, SpinnerIcon, TargetIcon } from "./icons";

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
}

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "failed");
      setToast("Year plan rebuilt — every block is explained below.");
      router.refresh();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Could not build the season.");
    } finally {
      setBusy(false);
    }
  }

  const season = props.season;
  const macrocycles = groupByMacrocycle(season?.blocks ?? []);

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Your season</h1>
          <p className="text-xs text-muted">
            The year above the week view: macrocycles per race, mesocycles inside them, planned
            backwards from every A race.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href="/plan" className="btn-ghost">
            <CalendarIcon size={16} />
            This week
          </Link>
          <Link href="/progress" className="btn-ghost">
            <ChartIcon size={16} />
            Progress
          </Link>
        </div>
      </div>

      {/* ── Calendar input ─────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <div className="text-sm font-semibold">Your races</div>
        <div className="space-y-2">
          {races.map((race, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[150px_1fr_120px_44px]">
              <input
                className="input"
                type="date"
                value={race.date}
                onChange={(e) => setRaces(patch(races, i, { date: e.target.value }))}
              />
              <input
                className="input"
                value={race.type}
                placeholder="Hyrox Open Men"
                onChange={(e) => setRaces(patch(races, i, { type: e.target.value }))}
              />
              <select
                className="input"
                value={race.priority}
                onChange={(e) =>
                  setRaces(patch(races, i, { priority: e.target.value as RaceDraft["priority"] }))
                }
              >
                <option value="A">A — peak</option>
                <option value="B">B — tune-up</option>
                <option value="C">C — training</option>
              </select>
              <button
                className="btn-ghost"
                aria-label="Remove race"
                onClick={() => setRaces(races.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button className="btn-ghost" onClick={() => setRaces([...races, { ...EMPTY_RACE }])}>
          + Add a race
        </button>

        <div>
          <label className="label">Your weaknesses (comma separated)</label>
          <input
            className="input"
            value={weaknessText}
            placeholder="Sled Push, Laktattoleranz, Wall Balls"
            onChange={(e) => setWeaknessText(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted">
            Each one is routed to the block where it belongs — strength work into base, lactate
            tolerance into build, race execution into the race-specific block.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={() => void generate()} disabled={busy}>
            {busy ? <SpinnerIcon size={16} /> : <SparkIcon size={16} />}
            {season ? "Rebuild the year plan" : "Build my year plan"}
          </button>
          <span className="text-xs text-muted">
            Only A races get a taper. B and C races are planned as hard training days.
          </span>
        </div>
      </div>

      {!season ? (
        <div className="card text-sm text-muted">
          No season yet — add your races above and the engine plans the year backwards from them.
        </div>
      ) : (
        <>
          {/* ── Timeline ─────────────────────────────────────────────── */}
          <div className="card space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm font-semibold">
                {fmtDate(season.start_date)} → {fmtDate(season.end_date)}
              </div>
              <div className="text-xs text-muted">
                {season.total_weeks} weeks · {season.races.length} race(s) ·{" "}
                {season.blocks.reduce((n, b) => n + b.deload_weeks.length, 0)} deload weeks
              </div>
            </div>

            {macrocycles.map((m) => (
              <div key={m.sort} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{m.label}</span>
                  <span className="text-muted">
                    week {m.blocks[0].start_week}–{m.blocks[m.blocks.length - 1].end_week}
                  </span>
                </div>
                <div className="flex h-9 overflow-hidden rounded-lg border border-line">
                  {m.blocks.map((b) => (
                    <div
                      key={b.sort_order}
                      title={`${titleCase(b.kind)} · week ${b.start_week}–${b.end_week} · volume ${Math.round(
                        b.volume_multiplier * 100,
                      )}%`}
                      className="relative flex items-center justify-center overflow-hidden text-[10px] font-semibold text-black/80"
                      style={{
                        flexGrow: b.weeks,
                        flexBasis: 0,
                        background: SEASON_BLOCK_COLORS[b.kind] ?? "#4b5563",
                        opacity: isCurrent(b, props.currentWeek) ? 1 : 0.75,
                        outline: isCurrent(b, props.currentWeek) ? "2px solid white" : undefined,
                        outlineOffset: "-2px",
                      }}
                    >
                      {b.weeks >= 2 ? `${b.weeks}w` : ""}
                    </div>
                  ))}
                </div>
                {/* Race markers under the bar */}
                <div className="flex flex-wrap gap-2 text-[10px] text-muted">
                  {season.races
                    .filter(
                      (r) =>
                        r.week_number >= m.blocks[0].start_week &&
                        r.week_number <= m.blocks[m.blocks.length - 1].end_week,
                    )
                    .map((r) => (
                      <span key={`${r.race_date}-${r.race_type}`} className="pill">
                        <TargetIcon size={12} className={r.is_anchor ? "text-accent" : "text-muted"} />
                        <span className="ml-1">
                          {r.priority} · {r.race_type} · {fmtDate(r.race_date)} (w{r.week_number})
                        </span>
                      </span>
                    ))}
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-3 border-t border-line pt-3 text-[10px] text-muted">
              {Object.entries(SEASON_BLOCK_COLORS).map(([kind, color]) => (
                <span key={kind} className="flex items-center gap-1">
                  <span className="h-2 w-4 rounded" style={{ background: color }} />
                  {titleCase(kind)}
                </span>
              ))}
            </div>
          </div>

          {/* ── Block detail ─────────────────────────────────────────── */}
          {macrocycles.map((m) => (
            <div key={`detail-${m.sort}`} className="space-y-3">
              <h2 className="text-sm font-semibold">{m.label}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {m.blocks.map((b) => (
                  <div
                    key={b.sort_order}
                    className={`card space-y-2 ${isCurrent(b, props.currentWeek) ? "border-accent" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ background: SEASON_BLOCK_COLORS[b.kind] ?? "#4b5563" }}
                        />
                        <span className="font-semibold">{titleCase(b.kind)}</span>
                        {isCurrent(b, props.currentWeek) && <span className="pill text-accent">now</span>}
                      </div>
                      <span className="text-xs text-muted">
                        w{b.start_week}–{b.end_week} · {b.weeks}w
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      {fmtDate(b.start_date)} → {fmtDate(b.end_date)} · volume{" "}
                      {Math.round(b.volume_multiplier * 100)}%
                      {b.deload_weeks.length > 0 && ` · deload w${b.deload_weeks.join(", w")}`}
                    </div>
                    <p className="text-sm">{b.focus}</p>
                    <ul className="space-y-1 text-xs text-muted">
                      {b.key_sessions.map((s) => (
                        <li key={s}>• {s}</li>
                      ))}
                    </ul>
                    {b.weakness_targets.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {b.weakness_targets.map((w) => (
                          <span key={w} className="pill text-accent2">
                            {w}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* ── Why the planner did what it did ──────────────────────── */}
          {season.notes.length > 0 && (
            <div className="card">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <SparkIcon size={16} className="text-accent2" /> How this year was planned
              </div>
              <ul className="space-y-2 text-xs">
                {season.notes.map((n, i) => (
                  <li key={i} className="rounded border border-line bg-surface2 p-2">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card text-xs text-muted">
            The week view builds the detailed sessions for the race cycle you are in
            {props.activePlanRaceDate
              ? ` (currently ${fmtDate(props.activePlanRaceDate)}).`
              : " — no weekly plan is active yet."}{" "}
            The year plan above is the map; <Link href="/plan" className="text-accent underline">this
            week</Link> is the terrain.
          </div>
        </>
      )}

      {toast && (
        <div
          className="fixed bottom-4 left-1/2 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm shadow-lg"
          onClick={() => setToast(null)}
        >
          <SparkIcon size={14} className="shrink-0 text-accent2" />
          {toast}
        </div>
      )}
    </main>
  );
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
