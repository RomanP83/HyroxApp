import type { RenderedBlock, Division, StationAlternative } from "@/lib/engine";
import { fmtPace, PACE_ZONE_LABEL, titleCase } from "@/lib/format";
import { SwapIcon } from "./icons";

interface ContentItem {
  exercise?: string;
  sets?: number;
  reps?: number;
  distance_m?: number;
  rest_sec?: number;
  load_by_division?: Record<string, string>;
  // A personal strength template speaks in the athlete's own numbers: a rep
  // range instead of one figure, kilos instead of division loads.
  /** Running, not erg metres or a carry — a swap must never cancel this. */
  is_run?: boolean;
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
export function BlockView({
  block,
  substitution,
  onSwap,
}: {
  block: RenderedBlock;
  /** Standing substitute for this block's station, when the athlete set one. */
  substitution?: StationAlternative | null;
  /** Opens the swap list. Omitted where swapping makes no sense (demo, print). */
  onSwap?: () => void;
}) {
  const division = block.load_adjustments.division;
  const items = (block.content as ContentItem[]) ?? [];
  const swappable = Boolean(onSwap) && Boolean(block.station) && block.station !== "general";
  return (
    <div
      className={`rounded-lg border bg-rack p-3 ${
        substitution ? "border-amber/40" : "border-edge"
      }`}
    >
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="pill">{titleCase(block.block_type)}</span>
        {block.station && block.station !== "general" && (
          <span className="pill">{titleCase(block.station)}</span>
        )}
        {block.load_adjustments.station_tier != null && (
          <span className="pill text-amber">tier {block.load_adjustments.station_tier}</span>
        )}
        {block.load_adjustments.pace_sec_km != null && (
          <span className="pill text-amber">
            {block.load_adjustments.pace_zone
              ? `${PACE_ZONE_LABEL[block.load_adjustments.pace_zone]} · `
              : ""}
            {fmtPace(block.load_adjustments.pace_sec_km)}
          </span>
        )}
        {block.load_adjustments.opening_pace_sec_km != null && (
          <span className="pill">
            out of the station: {fmtPace(block.load_adjustments.opening_pace_sec_km)}
          </span>
        )}
        {block.load_adjustments.strength_modifier != null && (
          <span className="pill text-amber">
            load ×{block.load_adjustments.strength_modifier.toFixed(2)}
          </span>
        )}
        {swappable && (
          <button
            type="button"
            onClick={onSwap}
            className="ml-auto flex items-center gap-1 rounded-control px-1.5 py-0.5 text-micro font-semibold text-ash transition-colors duration-150 ease-out hover:bg-well hover:text-bone"
          >
            <SwapIcon size={13} />
            {substitution ? "Swapped" : "Swap"}
          </button>
        )}
      </div>

      {substitution && (
        // The substitute replaces the prescription on the card, and says in the
        // same breath what it does not replace. A swap that hides its cost
        // quietly changes what the session trains.
        <div className="mb-2 rounded-control border border-amber/30 bg-amber/5 p-2.5">
          <div className="text-base font-semibold text-chalk">{substitution.name}</div>
          <p className="mt-0.5 text-meta leading-relaxed text-bone">
            {substitution.prescription}
          </p>
          <p className="mt-1.5 text-micro leading-relaxed text-ash">
            <b className="text-go">Keeps:</b> {substitution.keeps}{" "}
            <b className="text-amber">Costs:</b> {substitution.costs}
          </p>
        </div>
      )}
      {block.load_adjustments.opening_pace_sec_km != null && (
        // Never sprint out of a station into Zone 5 — the opening metres are
        // for rhythm and breathing.
        <p className="mb-2 text-xs text-ash">
          First {block.load_adjustments.opening_distance_m} m at{" "}
          {fmtPace(block.load_adjustments.opening_pace_sec_km)}, then settle onto{" "}
          {fmtPace(block.load_adjustments.pace_sec_km)}. The first{" "}
          {block.load_adjustments.stabilise_distance_m} m are for finding your breathing — never
          sprint out of a station.
        </p>
      )}
      {substitution && (
        <div className="mb-1 text-micro font-semibold uppercase tracking-wider text-smoke">
          Instead of
        </div>
      )}
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => {
          const load = loadFor(it, division);
          const reps = repsFor(it);
          // A substitute replaces the station work and nothing else. The run in
          // a compromised block is still the run — striking it through would
          // cancel half the session because the sled was busy.
          const replaced = Boolean(substitution) && !it.is_run;
          return (
            <li
              key={i}
              className={`flex flex-wrap items-baseline gap-x-2 ${
                replaced ? "text-smoke line-through decoration-smoke/40" : ""
              }`}
            >
              <span className="font-medium">{it.exercise}</span>
              {it.superset_group && <span className="pill">SS {it.superset_group}</span>}
              <span className="text-ash">
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
