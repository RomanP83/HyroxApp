// ============================================================================
// Physical feedback (design cheatsheet #4). The web's haptics surface is
// navigator.vibrate (Android/Chrome); on unsupported platforms this is a
// silent no-op and the press-scale animation carries the physicality.
// Subtle for regular taps, stronger for confirmations and milestones.
// ============================================================================

type HapticKind = "tap" | "confirm" | "milestone";

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 10,
  confirm: [15, 40, 20],
  milestone: [20, 60, 20, 60, 40],
};

export function haptic(kind: HapticKind = "tap"): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(PATTERNS[kind]);
    }
  } catch {
    // never let feedback break the action it acknowledges
  }
}
