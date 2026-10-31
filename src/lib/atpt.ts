// ============================================================================
// AT-PT — a threshold performance trial on the erg.
//
// Five minutes held at a fixed heart rate near threshold: the score is the
// average power those five minutes bought. A second number — how long the
// heart takes to come back down afterwards — says how fast the athlete clears
// the effort. Same heart rate, more watts, faster way down: fitter.
//
// The targets come from the athlete's own maximum heart rate, not from an age
// formula. They are fractions of HRmax, kept here so there is one place to
// argue with them.
// ============================================================================

/** Centre of the hold band. Erg threshold sits a little below running threshold. */
export const ATPT_HOLD_FRACTION = 0.87;
/** Half-width of the hold band, in beats. */
export const ATPT_BAND_BPM = 3;
/** Where the warm-up should end. */
export const ATPT_WARMUP_FRACTION = 0.8;
/** The recovery clock stops here. */
export const ATPT_RECOVERY_FRACTION = 2 / 3;

/** Plausible maximum heart rates — anything outside is a typo, not a heart. */
export const HR_MAX_MIN = 120;
export const HR_MAX_MAX = 230;

export const ATPT_WATTS_SLUG = "atpt_watts";
export const ATPT_RECOVERY_SLUG = "atpt_recovery";

export interface AtPtTargets {
  hrMax: number;
  warmupTo: number;
  holdLow: number;
  holdHigh: number;
  hold: number;
  recoveryTo: number;
}

export function isValidHrMax(hrMax: unknown): hrMax is number {
  return (
    typeof hrMax === "number" &&
    Number.isInteger(hrMax) &&
    hrMax >= HR_MAX_MIN &&
    hrMax <= HR_MAX_MAX
  );
}

/** The trial's heart-rate targets for one athlete, or null without a usable HRmax. */
export function atPtTargets(hrMax: number | null | undefined): AtPtTargets | null {
  if (!isValidHrMax(hrMax)) return null;
  const hold = Math.round(hrMax * ATPT_HOLD_FRACTION);
  return {
    hrMax,
    warmupTo: Math.round(hrMax * ATPT_WARMUP_FRACTION),
    hold,
    holdLow: hold - ATPT_BAND_BPM,
    holdHigh: hold + ATPT_BAND_BPM,
    recoveryTo: Math.round(hrMax * ATPT_RECOVERY_FRACTION),
  };
}
