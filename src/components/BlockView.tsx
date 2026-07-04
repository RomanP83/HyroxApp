import type { RenderedBlock, Division } from "@/lib/engine";
import { fmtPace, titleCase } from "@/lib/format";

interface ContentItem {
  exercise?: string;
  sets?: number;
  reps?: number;
  distance_m?: number;
  rest_sec?: number;
  load_by_division?: Record<string, string>;
}

function loadFor(item: ContentItem, division: Division): string | null {
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

/** One rendered block with explicit per-division loads (PP2). */
export function BlockView({ block }: { block: RenderedBlock }) {
  const division = block.load_adjustments.division;
  const items = (block.content as ContentItem[]) ?? [];
  return (
    <div className="rounded-lg border border-line bg-surface2 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="pill">{titleCase(block.block_type)}</span>
        {block.station && block.station !== "general" && (
          <span className="pill">{titleCase(block.station)}</span>
        )}
        {block.load_adjustments.station_tier != null && (
          <span className="pill text-accent2">tier {block.load_adjustments.station_tier}</span>
        )}
        {block.load_adjustments.pace_sec_km != null && (
          <span className="pill text-accent2">{fmtPace(block.load_adjustments.pace_sec_km)}</span>
        )}
      </div>
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => {
          const load = loadFor(it, division);
          return (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{it.exercise}</span>
              <span className="text-muted">
                {it.sets ? `${it.sets}×` : ""}
                {it.reps ? `${it.reps}` : ""}
                {it.distance_m ? `${it.reps ? " · " : ""}${it.distance_m} m` : ""}
                {load ? ` · ${load}` : ""}
                {it.rest_sec ? ` · rest ${it.rest_sec}s` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
