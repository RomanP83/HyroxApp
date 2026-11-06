/** Display an ISO calendar date without converting it to the browser timezone. */
export function fmtCalendarDate(isoDate: string): string {
  return isoDate.slice(0, 10).split("-").reverse().join(".");
}

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

/**
 * The heart-rate band that belongs to each pace zone.
 *
 * The session TYPE carries one band — "Zone 4-5 · 88-95% HRmax" for everything
 * filed as intervals — and that is as wrong over a 25-minute threshold block as
 * the pace was. Where a session names its zone, the band follows it.
 */
export const PACE_ZONE_HR: Record<string, string> = {
  easy_sec_km: "Zone 2 · 65-75% HRmax",
  tempo_sec_km: "Zone 4 · 85-90% HRmax",
  interval_sec_km: "Zone 5 · 92-100% HRmax",
  race_sec_km: "Zone 4 · race effort",
};

/**
 * Weekday labels, 1 = Monday. One array, because four of them side by side is
 * how two lists rendering in the same column drift apart without a test
 * noticing.
 */
export const WEEKDAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * An ISO date as "3 Mar", for sitting beside a weekday.
 *
 * Formatted by hand rather than through toLocaleDateString: the same string has
 * to come out of the server render and the browser one, and a locale that
 * differs between them is a hydration mismatch on every card.
 */
export function fmtDayDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function demandOf(sessionType: string): Demand {
  return DEMAND_OF[sessionType] ?? "load";
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Read a clock the way people type one: "1:24:55", "4:30" or plain seconds.
 * Returns whole seconds, or null for anything that is not a positive time.
 */
export function parseClock(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (parts.length > 1 && nums.slice(1).some((n) => n >= 60)) return null;
  const sec = nums.reduce((acc, n) => acc * 60 + n, 0);
  return sec > 0 ? Math.round(sec) : null;
}
