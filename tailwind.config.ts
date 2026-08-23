import type { Config } from "tailwindcss";

// ============================================================================
// The palette comes from the room this sport happens in: a matte black indoor
// arena, sled turf, chalk on hands, and the amber LED of a race clock. One hue
// runs through every surface — only the lightness moves — so the interface
// reads as one space rather than a set of panels from different products.
//
// Naming is deliberate: a token called `floor` or `chalk` says which world it
// belongs to. `gray-700` would fit any project, which is the problem.
// ============================================================================
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Surfaces: one hue, lightness only. Whisper-quiet steps. ─────────
        /** The arena floor — the page itself. */
        floor: "#080c10",
        /** A panel resting on the floor: cards, the session list's own ground. */
        lane: "#0f1620",
        /** One step up: nested emphasis, popovers, raised rows. */
        rack: "#16202b",
        /** Inset — inputs are sunk INTO the surface, never floated above it. */
        well: "#05080b",

        // ── Text: four levels, because two is not a hierarchy. ──────────────
        chalk: "#e7edf2", // primary
        bone: "#aebbc6", // secondary — body text that still carries weight
        ash: "#7b8b98", // tertiary — metadata, labels
        smoke: "#55636f", // muted — disabled, decoration

        // ── Signal. ONE accent; everything else means something specific. ───
        /** The accent: actions, and the hard end of the effort scale. */
        flame: "#ff5a1f",
        /** Attention — a deload, a benchmark, a note from the engine. */
        amber: "#e8a33a",
        /** Aerobic, done, on target. Desaturated: dark grounds amplify chroma. */
        go: "#35b88a",
        /** Error, injury, over the line. */
        stop: "#e0646c",
      },
      borderColor: {
        // Borders are rgba so they blend into whatever they sit on; a solid hex
        // edge reads as a drawn line, which is exactly what we do not want.
        DEFAULT: "rgba(255,255,255,0.075)",
        edge: "rgba(255,255,255,0.075)",
        "edge-strong": "rgba(255,255,255,0.15)",
      },
      ringColor: {
        edge: "rgba(255,255,255,0.075)",
        "edge-strong": "rgba(255,255,255,0.15)",
      },
      fontFamily: {
        sans: ["var(--font-ui)", "ui-sans-serif", "system-ui", "sans-serif"],
        // Every time, split and distance in this sport is read off a clock.
        mono: ["var(--font-data)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // A 14px base stepped at ~1.25 — a scale you can see, not 15/16/17 mush.
        micro: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }], // 11
        meta: ["0.75rem", { lineHeight: "1.1rem" }], // 12
        base: ["0.875rem", { lineHeight: "1.45rem" }], // 14
        lead: ["1rem", { lineHeight: "1.5rem" }], // 16
        h3: ["1.125rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em" }], // 18
        h2: ["1.375rem", { lineHeight: "1.7rem", letterSpacing: "-0.015em" }], // 22
        h1: ["1.75rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }], // 28
        clock: ["2.75rem", { lineHeight: "1", letterSpacing: "-0.03em" }], // 44
      },
      borderRadius: {
        // Concentric: a 12px card holding 16px of padding wants ~8px children.
        control: "0.5rem", // 8  — buttons, inputs, chips
        panel: "0.75rem", // 12 — cards
        stage: "1rem", // 16 — modals
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        // Custom ease-out: the built-in curves are too weak to feel deliberate.
        "fade-up": "fade-up 0.22s cubic-bezier(0.23, 1, 0.32, 1) both",
        "pop-in": "pop-in 0.18s cubic-bezier(0.23, 1, 0.32, 1) both",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
