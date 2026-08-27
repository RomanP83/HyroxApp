export function fmtPace(secKm?: number): string {
  if (!secKm) return "—";
  const m = Math.floor(secKm / 60);
  const s = Math.round(secKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function fmtClock(totalSeconds?: number | null): string {
  if (totalSeconds == null) return "—";
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/**
 * The palette, once, in TypeScript — for the places that need a colour as a
 * value (inline styles, canvas, chart strokes) rather than a class. Same
 * numbers as tailwind.config.ts; changing one means changing both.
 */
export const PALETTE = {
  flame: "#ff5a1f",
  amber: "#e8a33a",
  go: "#35b88a",
  stop: "#e0646c",
  smoke: "#55636f",
  ash: "#7b8b98",
  cool: "#6ea8fe",
  violet: "#a78bfa",
} as const;

export const PHASE_COLORS: Record<string, string> = {
  base: PALETTE.go,
  build: PALETTE.amber,
  peak: PALETTE.flame,
  taper: PALETTE.cool,
};

/** Season block colours — the year view reuses the phase palette so a block
 *  and the plan phase it later becomes read as the same thing. */
export const SEASON_BLOCK_COLORS: Record<string, string> = {
  post_race_recovery: PALETTE.smoke,
  base: PALETTE.go,
  build: PALETTE.amber,
  race_specific: PALETTE.flame,
  bridge: PALETTE.violet,
  taper: PALETTE.cool,
  open_base: "#3b4653",
};

/**
 * What a day demands of you — the one axis a training week is actually read
 * on. This is the same split the engine reasons with (see MAX_HARD_SESSIONS_
 * PER_WEEK), so the colour on screen and the rule in the engine cannot drift.
 */
export type Demand = "hard" | "aerobic" | "load" | "recovery";

const DEMAND_OF: Record<string, Demand> = {
  run_intervals: "hard",
  compromised_run: "hard",
  full_sim: "hard",
  benchmark: "hard",
  race_day: "hard",
  long_run: "aerobic",
  run_easy: "aerobic",
  strength: "load",
  station_work: "load",
  mobility: "recovery",
  rest: "recovery",
};

export const DEMAND_COLORS: Record<Demand, string> = {
  hard: PALETTE.flame,
  aerobic: PALETTE.go,
  load: PALETTE.amber,
  recovery: PALETTE.smoke,
};

export const DEMAND_LABELS: Record<Demand, string> = {
  hard: "Hard",
  aerobic: "Aerobic",
  load: "Load",
  recovery: "Recovery",
};

/**
 * "1:25:30", "85:00" or "5:30" back into seconds; blank and nonsense become
 * null. The inverse of fmtClock, and the only reader of a typed-in time —
 * every clock field in the app goes through this one so they all accept the
 * same three shapes.
 */
export function parseClock(text: string): number | null {
  const parts = text.trim().split(":").map((p) => Number(p));
  if (!parts.length || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds > 0 ? Math.round(seconds) : null;
}

/**
 * What a pace zone is called on a card.
 *
 * A bare "4:42/km" on an interval session reads as "the interval pace" whatever
 * it actually is — which is how a threshold block spent months displaying a
 * number nobody could place. The zone is named next to it now.
 */
export const PACE_ZONE_LABEL: Record<string, string> = {
  easy_sec_km: "easy",
  tempo_sec_km: "threshold",
  interval_sec_km: "intervals",
  race_sec_km: "race pace",
};

export function demandOf(sessionType: string): Demand {
  return DEMAND_OF[sessionType] ?? "load";
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
