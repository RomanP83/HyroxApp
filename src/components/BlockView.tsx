import type { RenderedBlock, Division } from "@/lib/engine";
import { fmtPace, PALETTE, titleCase } from "@/lib/format";

interface ContentItem {
  exercise?: string;
  sets?: number;
  reps?: number;
  distance_m?: number;
  rest_sec?: number;
  load_by_division?: Record<string, string>;
  // A personal strength template speaks in the athlete's own numbers: a rep
  // range instead of one figure, kilos instead of division loads.
  rep_min?: number | null;
  rep_max?: number | null;
  load_kg?: number | null;
  superset_group?: string | null;
}

function repsFor(item: ContentItem): string {
  if (item.rep_min != null || item.rep_max != null) {
    return item.rep_min === item.rep_max ? `${item.rep_min}` : `${item.rep_min ?? "?"}–${item.rep_max ?? "?"}`;
  }
  return item.reps != null ? String(item.reps) : "";
}

function loadFor(item: ContentItem, division: Division): string | null {
  if (item.load_kg != null) return `${item.load_kg} kg`;
  if (!item.load_by_division) return null;
  // Doubles/masters fall back to the closest base division weight.
  const key =
    item.load_by_division[division] != null
      ? division
      : division.includes("pro")
        ? "pro"
        : "open";
  return item.load_by_division[key] ?? null;
}

/**
 * Each block is a section of the session, read top to bottom like a script:
 * warm-up, the work itself, what comes after. The header carries the colour
 * of what the section asks — the same language as the effort rail.
 */
const SECTION: Record<string, { label: string; color?: string }> = {
  warmup: { label: "Warm-up", color: PALETTE.ash },
  main: { label: "Main set" }, // takes the session's own demand colour
  finisher: { label: "Finisher", color: PALETTE.flame },
  mobility: { label: "Mobility", color: PALETTE.go },
};

/** How many numbered steps a block contributes — for numbering across blocks. */
export function stepCount(block: RenderedBlock): number {
  return ((block.content as ContentItem[]) ?? []).length;
}

/**
 * One rendered block with explicit per-division loads (PP2), as a section of
 * numbered steps. `startAt` continues the numbering from the block before, so
 * a session reads 1…n from warm-up to cool-down. `accent` is the session's
 * demand colour, used for the main set.
 */
export function BlockView({
  block,
  startAt = 1,
  accent = PALETTE.flame,
}: {
  block: RenderedBlock;
  startAt?: number;
  accent?: string;
}) {
  const division = block.load_adjustments.division;
  const items = (block.content as ContentItem[]) ?? [];
  const section = SECTION[block.block_type] ?? { label: titleCase(block.block_type) };
  const color = section.color ?? accent;
  const a = block.load_adjustments;

  return (
    <section
      className="overflow-hidden rounded-control border border-edge bg-rack"
      data-block-type={block.block_type}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-1.5"
        style={{ background: `${color}1f` }}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span
            className="font-mono text-micro font-bold uppercase tracking-widest"
            style={{ color }}
          >
            {section.label}
          </span>
          {block.station && block.station !== "general" && (
            <span className="text-micro font-semibold uppercase tracking-wider text-bone">
              {titleCase(block.station)}
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {a.station_tier != null && <span className="pill text-amber">tier {a.station_tier}</span>}
          {a.pace_sec_km != null && (
            <span className="pill border-amber/40 font-mono normal-case tracking-normal text-amber">
              {fmtPace(a.pace_sec_km)}
            </span>
          )}
          {a.strength_modifier != null && (
            <span className="pill text-amber">load ×{a.strength_modifier.toFixed(2)}</span>
          )}
        </span>
      </header>

      {a.opening_pace_sec_km != null && (
        // Never sprint out of a station into Zone 5 — the opening metres are
        // for rhythm and breathing.
        <p className="border-b border-edge px-3 py-2 text-meta text-ash">
          <span className="pill mr-1.5 normal-case tracking-normal">
            out of the station: {fmtPace(a.opening_pace_sec_km)}
          </span>
          First {a.opening_distance_m} m at {fmtPace(a.opening_pace_sec_km)}, then settle onto{" "}
          {fmtPace(a.pace_sec_km)}. The first {a.stabilise_distance_m} m are for finding your
          breathing — never sprint out of a station.
        </p>
      )}

      <ol className="divide-y divide-edge">
        {items.map((it, i) => {
          const load = loadFor(it, division);
          const reps = repsFor(it);
          // "3 × 8", "3 × 20 m", "800 m" — sets multiply whatever the step is.
          const amount = [reps, it.distance_m ? `${it.distance_m} m` : ""]
            .filter(Boolean)
            .join(" · ");
          const dose = [
            it.sets ? `${it.sets} × ${amount || "—"}` : amount,
            it.rest_sec ? `rest ${it.rest_sec}s` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={i} className="flex items-start gap-3 px-3 py-2.5">
              <span className="w-5 shrink-0 pt-px text-right font-mono text-meta font-semibold tabular-nums text-smoke">
                {startAt + i}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-base font-medium text-chalk">{it.exercise}</span>
                  {it.superset_group && <span className="pill">SS {it.superset_group}</span>}
                </div>
                {dose && <div className="font-mono text-meta tabular-nums text-ash">{dose}</div>}
              </div>
              {load && (
                <span className="shrink-0 pt-px font-mono text-meta font-semibold tabular-nums text-bone">
                  {load}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
