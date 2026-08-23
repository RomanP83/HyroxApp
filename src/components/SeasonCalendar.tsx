"use client";

// ============================================================================
// The season as a calendar: months of real days, tinted by the block each week
// belongs to, with the races marked on the dates they actually happen.
//
// The timeline above it answers "how long is my build block"; this answers the
// question an athlete actually asks — "what does my March look like, and what
// happens to the week I fly to Berlin". Clicking a day adds a race there.
// ============================================================================
import { SEASON_BLOCK_COLORS, titleCase } from "@/lib/format";

export interface CalendarBlock {
  kind: string;
  start_date: string;
  end_date: string;
}

export interface CalendarRace {
  race_date: string;
  race_type: string;
  priority: "A" | "B" | "C";
  is_anchor: boolean;
}

interface Props {
  startDate: string;
  endDate: string;
  today: string;
  blocks: CalendarBlock[];
  races: CalendarRace[];
  onPickDate?: (iso: string) => void;
  /** Months to render at most — a 52-week season is 13 of them. */
  maxMonths?: number;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function utc(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday-first weekday index, 0..6. */
function dow(d: Date): number {
  const wd = d.getUTCDay();
  return wd === 0 ? 6 : wd - 1;
}

function monthsBetween(start: string, end: string, max: number): { year: number; month: number }[] {
  const a = utc(start);
  const b = utc(end);
  const out: { year: number; month: number }[] = [];
  let y = a.getUTCFullYear();
  let m = a.getUTCMonth();
  while (out.length < max && (y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth()))) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

export function SeasonCalendar(props: Props) {
  const months = monthsBetween(props.startDate, props.endDate, props.maxMonths ?? 13);

  const blockAt = (day: string): CalendarBlock | undefined =>
    props.blocks.find((b) => day >= b.start_date && day <= b.end_date);
  const raceAt = (day: string): CalendarRace | undefined =>
    props.races.find((r) => r.race_date.slice(0, 10) === day);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {months.map(({ year, month }) => {
        const first = new Date(Date.UTC(year, month, 1));
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const lead = dow(first);
        const cells: (string | null)[] = [
          ...Array.from({ length: lead }, () => null),
          ...Array.from({ length: daysInMonth }, (_, i) => iso(new Date(first.getTime() + i * DAY_MS))),
        ];

        return (
          <div key={`${year}-${month}`} className="rounded-lg border border-edge p-2">
            <div className="mb-1 px-1 text-xs font-semibold">
              {first.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}
            </div>
            <div className="grid grid-cols-7 gap-[2px] text-center text-[9px] text-ash">
              {WEEKDAYS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="mt-[2px] grid grid-cols-7 gap-[2px]">
              {cells.map((day, i) => {
                if (!day) return <div key={`pad-${i}`} />;
                const block = blockAt(day);
                const race = raceAt(day);
                const color = block ? (SEASON_BLOCK_COLORS[block.kind] ?? "#4b5563") : undefined;
                const isToday = day === props.today;
                const label = [
                  day,
                  block ? titleCase(block.kind) : "outside the season",
                  race ? `${race.priority} · ${race.race_type}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <button
                    key={day}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={props.onPickDate ? () => props.onPickDate?.(day) : undefined}
                    className={`relative flex h-6 items-center justify-center rounded text-[10px] tabular-nums transition ${
                      props.onPickDate ? "hover:ring-1 hover:ring-flame" : ""
                    } ${isToday ? "font-bold ring-1 ring-white/70" : ""}`}
                    style={{
                      background: race
                        ? color ?? "#4b5563"
                        : color
                          ? `${color}2e` // the block colour at ~18% — a tint, not a fill
                          : "transparent",
                      color: race ? "rgba(0,0,0,.85)" : undefined,
                    }}
                  >
                    {race ? race.priority : Number(day.slice(8, 10))}
                    {race?.is_anchor && (
                      <span className="absolute -top-[3px] -right-[3px] h-[6px] w-[6px] rounded-full bg-white" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
