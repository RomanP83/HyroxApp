import type { RenderedBlock, Division } from "@/lib/engine";
import { fmtPace, titleCase } from "@/lib/format";

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
        {block.load_adjustments.opening_pace_sec_km != null && (
          <span className="pill">
            out of the station: {fmtPace(block.load_adjustments.opening_pace_sec_km)}
          </span>
        )}
        {block.load_adjustments.strength_modifier != null && (
          <span className="pill text-accent2">
            load ×{block.load_adjustments.strength_modifier.toFixed(2)}
          </span>
        )}
      </div>
      {block.load_adjustments.opening_pace_sec_km != null && (
        // Never sprint out of a station into Zone 5 — the opening metres are
        // for rhythm and breathing.
        <p className="mb-2 text-xs text-muted">
          First {block.load_adjustments.opening_distance_m} m at{" "}
          {fmtPace(block.load_adjustments.opening_pace_sec_km)}, then settle onto{" "}
          {fmtPace(block.load_adjustments.pace_sec_km)}. The first{" "}
          {block.load_adjustments.stabilise_distance_m} m are for finding your breathing — never
          sprint out of a station.
        </p>
      )}
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => {
          const load = loadFor(it, division);
          const reps = repsFor(it);
          return (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{it.exercise}</span>
              {it.superset_group && <span className="pill">SS {it.superset_group}</span>}
              <span className="text-muted">
                {it.sets ? `${it.sets}×` : ""}
                {reps}
                {it.distance_m ? `${reps ? " · " : ""}${it.distance_m} m` : ""}
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
