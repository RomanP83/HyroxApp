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

export const PHASE_COLORS: Record<string, string> = {
  base: "#3ecf8e",
  build: "#ffb020",
  peak: "#ff5a1f",
  taper: "#6ea8fe",
};

/** Season block colours — the year view reuses the phase palette so a block
 *  and the plan phase it later becomes read as the same thing. */
export const SEASON_BLOCK_COLORS: Record<string, string> = {
  post_race_recovery: "#8b93a7",
  base: "#3ecf8e",
  build: "#ffb020",
  race_specific: "#ff5a1f",
  bridge: "#c084fc",
  taper: "#6ea8fe",
  open_base: "#4b5563",
};

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
