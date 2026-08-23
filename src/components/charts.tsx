// ============================================================================
// Server-rendered SVG charts (Phase C1). Follows the dataviz mark specs:
// 2px lines (round join/cap), markers r>=4 with a 2px surface ring, bars
// <=24px with 4px rounded data-ends, 1px solid recessive gridlines, text in
// text tokens (never series colors), legend for two series / none for one,
// native <title> tooltips per mark, and a <details> table view per chart.
// Palette (validated against surface #141b24 with the skill's validator):
// series-1 #3987e5 (blue), series-2 #c98500 (yellow).
// ============================================================================

export const VIZ = {
  surface: "#141b24",
  grid: "#26333f",
  text: "#8fa1b0",
  series1: "#3987e5",
  series2: "#c98500",
};

const W = 640;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 26, left: 44 };

export interface Pt {
  label: string;
  y: number;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / count / step;
  const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const s = mult * step;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) ticks.push(Number(v.toFixed(6)));
  return ticks;
}

interface Scale {
  x: (i: number) => number;
  y: (v: number) => number;
  ticks: number[];
}

function makeScale(n: number, values: number[], domain?: [number, number]): Scale {
  const lo = domain ? domain[0] : Math.min(...values);
  const hi = domain ? domain[1] : Math.max(...values);
  const pad = domain ? 0 : (hi - lo || 1) * 0.12;
  const ymin = lo - pad;
  const ymax = hi + pad;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  return {
    x: (i) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW),
    y: (v) => PAD.top + innerH - ((v - ymin) / (ymax - ymin || 1)) * innerH,
    ticks: niceTicks(ymin, ymax),
  };
}

function Grid({ scale, fmt }: { scale: Scale; fmt: (v: number) => string }) {
  return (
    <g>
      {scale.ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={scale.y(t)}
            y2={scale.y(t)}
            stroke={VIZ.grid}
            strokeWidth={1}
          />
          <text x={PAD.left - 6} y={scale.y(t) + 3} textAnchor="end" fontSize={10} fill={VIZ.text}>
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

function XLabels({ labels, scale }: { labels: string[]; scale: Scale }) {
  const every = Math.max(1, Math.ceil(labels.length / 8));
  return (
    <g>
      {labels.map((l, i) =>
        i % every === 0 ? (
          <text key={i} x={scale.x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={VIZ.text}>
            {l}
          </text>
        ) : null,
      )}
    </g>
  );
}

/** Empty state (#3): never a bare "no data" — say what fills it + one action. */
function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-edge py-8 text-center">
      <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-ash" aria-hidden="true">
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 3 3 5-6" strokeDasharray="2 3" />
      </svg>
      <p className="max-w-xs text-sm text-ash">
        This chart fills up as you train — every logged session adds a point.
      </p>
      <a href="/plan" className="text-sm font-semibold text-flame hover:underline">
        Log today&apos;s session →
      </a>
    </div>
  );
}

function DataTable({ rows, cols }: { rows: (string | number)[][]; cols: string[] }) {
  return (
    <details className="mt-2 text-xs text-ash">
      <summary className="cursor-pointer">Data table</summary>
      <table className="mt-1 w-full text-left">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className="py-0.5 pr-3 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="py-0.5 pr-3">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Single- or two-series line chart with optional reference hairlines. */
export function LineChart({
  series,
  secondary,
  legend,
  fmt = (v) => String(v),
  refLines = [],
  domain,
}: {
  series: Pt[];
  secondary?: Pt[];
  legend?: [string, string];
  fmt?: (v: number) => string;
  refLines?: { y: number; label: string }[];
  domain?: [number, number];
}) {
  if (!series.length) return <EmptyState />;
  const all = [...series.map((p) => p.y), ...(secondary ?? []).map((p) => p.y), ...refLines.map((r) => r.y)];
  const scale = makeScale(series.length, all, domain);
  const path = (pts: Pt[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${scale.x(i).toFixed(1)},${scale.y(p.y).toFixed(1)}`).join(" ");

  return (
    <div>
      {legend && (
        <div className="mb-1 flex gap-4 text-xs text-ash">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: VIZ.series1 }} />
            {legend[0]}
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: VIZ.series2 }} />
            {legend[1]}
          </span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        <Grid scale={scale} fmt={fmt} />
        {refLines.map((r) => (
          <g key={r.label}>
            <line x1={PAD.left} x2={W - PAD.right} y1={scale.y(r.y)} y2={scale.y(r.y)} stroke={VIZ.text} strokeWidth={1} strokeOpacity={0.5} />
            <text x={W - PAD.right} y={scale.y(r.y) - 3} textAnchor="end" fontSize={9} fill={VIZ.text}>
              {r.label}
            </text>
          </g>
        ))}
        <path d={path(series)} fill="none" stroke={VIZ.series1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((p, i) => (
          <circle key={i} cx={scale.x(i)} cy={scale.y(p.y)} r={4} fill={VIZ.series1} stroke={VIZ.surface} strokeWidth={2}>
            <title>{`${p.label}: ${fmt(p.y)}`}</title>
          </circle>
        ))}
        {secondary?.map((p, i) => (
          <circle key={i} cx={scale.x(i)} cy={scale.y(p.y)} r={4} fill={VIZ.series2} stroke={VIZ.surface} strokeWidth={2}>
            <title>{`${p.label}: ${fmt(p.y)}`}</title>
          </circle>
        ))}
        {/* direct label: latest primary value only */}
        <text
          x={scale.x(series.length - 1)}
          y={scale.y(series[series.length - 1].y) - 8}
          textAnchor="end"
          fontSize={10}
          fill="#e8eef3"
        >
          {fmt(series[series.length - 1].y)}
        </text>
        <XLabels labels={series.map((p) => p.label)} scale={scale} />
      </svg>
      <DataTable
        cols={legend ? ["Point", legend[0], legend[1]] : ["Point", "Value"]}
        rows={series.map((p, i) => (legend ? [p.label, fmt(p.y), secondary?.[i] != null ? fmt(secondary[i].y) : "—"] : [p.label, fmt(p.y)]))}
      />
    </div>
  );
}

/** Single-series bar chart (magnitude), bars <=24px, rounded data-end. */
export function BarChart({
  bars,
  fmt = (v) => String(v),
  domain,
}: {
  bars: Pt[];
  fmt?: (v: number) => string;
  domain?: [number, number];
}) {
  if (!bars.length) return <EmptyState />;
  const scale = makeScale(bars.length, bars.map((b) => b.y), domain ?? [0, Math.max(...bars.map((b) => b.y), 1)]);
  const innerW = W - PAD.left - PAD.right;
  const bw = Math.min(24, (innerW / bars.length) * 0.6);
  const y0 = scale.y(domain ? domain[0] : 0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        <Grid scale={scale} fmt={fmt} />
        {bars.map((b, i) => {
          const x = scale.x(i) - bw / 2;
          const yTop = scale.y(b.y);
          const h = Math.max(0, y0 - yTop);
          const r = Math.min(4, bw / 2, h);
          return (
            <path
              key={i}
              d={`M${x},${y0} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} L${x + bw - r},${yTop} Q${x + bw},${yTop} ${x + bw},${yTop + r} L${x + bw},${y0} Z`}
              fill={VIZ.series1}
            >
              <title>{`${b.label}: ${fmt(b.y)}`}</title>
            </path>
          );
        })}
        {/* direct label: latest bar only */}
        <text x={scale.x(bars.length - 1)} y={scale.y(bars[bars.length - 1].y) - 6} textAnchor="middle" fontSize={10} fill="#e8eef3">
          {fmt(bars[bars.length - 1].y)}
        </text>
        <XLabels labels={bars.map((b) => b.label)} scale={scale} />
      </svg>
      <DataTable cols={["Point", "Value"]} rows={bars.map((b) => [b.label, fmt(b.y)])} />
    </div>
  );
}
