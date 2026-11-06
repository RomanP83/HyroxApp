import type { Config } from "tailwindcss";

// ============================================================================
// The box whiteboard — the same design as the HyroxTraining tracker
// (docs/design.md). A cool enamel board inside an aluminium frame rail, white
// ruled panels, and marker colours that each mean one thing:
//
//   ink   the work, and the fill of everything you can press
//   red   targets and gaps still open (and the hard end of the effort scale)
//   blue  running — and, as an interaction colour, links and focus
//   green done, and targets already met — nothing else
//   orange HYROX station work, and the engine's attention notes
//
// The token NAMES are the app's own (floor, lane, chalk …) so components keep
// their meaning; the VALUES are the whiteboard's.
// ============================================================================
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Surfaces ───────────────────────────────────────────────────────
        /** Enamel board — the page ground and the sheet ground. */
        floor: "#f0f2f3",
        /** Board panel white — cards, inputs, chips, the bottom tab bar. */
        lane: "#ffffff",
        /** Sunk panel — panels nested inside a panel, set rows, empty states. */
        rack: "#f6f7f8",
        /** Inputs sit on panel white with a rule, not sunk into the board. */
        well: "#ffffff",

        // ── Ink ────────────────────────────────────────────────────────────
        chalk: "#1b1d20", // ink — primary text, pressable fills
        bone: "#454b50", // ink 2 — secondary text, labels
        ash: "#5f666b", // ink 3 — meta lines, dimmed days
        smoke: "#80878b", // decoration only — never body text

        // ── Markers ────────────────────────────────────────────────────────
        /** Target red: targets, open gaps, the hard end of the effort scale. */
        flame: "#c12d24",
        /** Station orange: HYROX station work, and an engine note to read. */
        amber: "#b4521a",
        /** Done green: done, and targets already met. */
        go: "#18794a",
        /** Error and over the line — the same red as a target still open. */
        stop: "#c12d24",
        /** Running blue: running, links, the focus ring. */
        run: "#1f4fb8",
        /** Done wash: the ground of a check that has been marked done. */
        wash: "#e9f4ee",

        // ── Frame (rail) — only ever on chrome, never under content ────────
        "rail-hi": "#d4d8da",
        "rail-lo": "#b6bbbe",
        "rail-edge": "#8f9497",
      },
      borderColor: {
        DEFAULT: "#d6dadc",
        edge: "#d6dadc", // rule — between rows and around panels
        "edge-strong": "#c2c7ca", // rule 2 — control outlines, chart axes
      },
      ringColor: {
        edge: "#d6dadc",
        "edge-strong": "#c2c7ca",
      },
      fontFamily: {
        sans: ["var(--font-ui)", "Barlow", "Segoe UI", "system-ui", "sans-serif"],
        // The board's writing: titles, section heads, and every number.
        display: ["var(--font-data)", "Barlow Condensed", "Arial Narrow", "sans-serif"],
        mono: ["var(--font-data)", "Barlow Condensed", "Arial Narrow", "sans-serif"],
      },
      fontSize: {
        micro: ["0.75rem", { lineHeight: "1.05rem", letterSpacing: "0.04em" }], // 12
        meta: ["0.8125rem", { lineHeight: "1.2rem" }], // 13 — label
        base: ["0.9375rem", { lineHeight: "1.45rem" }], // 15 — body small
        lead: ["1rem", { lineHeight: "1.5rem" }], // 16 — body
        h3: ["1.0625rem", { lineHeight: "1.4rem" }], // 17 — title
        h2: ["1.375rem", { lineHeight: "1.65rem", letterSpacing: "0.01em" }], // 22 — headline
        h1: ["clamp(2.25rem, 7vw, 3rem)", { lineHeight: "1" }], // display
        clock: ["clamp(2rem, 6.4vw, 2.75rem)", { lineHeight: "1" }], // number n1
      },
      borderRadius: {
        control: "6px", // buttons, inputs, chips, nav items
        panel: "8px", // panels, folds
        stage: "8px", // sheets
      },
      boxShadow: {
        // The one lift: what is happening today. Nothing else gets a shadow.
        lift: "0 1px 0 #e3e5e1, 0 14px 30px -20px rgba(27,29,32,.5)",
        sheet: "0 30px 80px -30px rgba(0,0,0,.55)",
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
        strike: {
          "0%": { transform: "rotate(-1.5deg) scaleX(0)" },
          "100%": { transform: "rotate(-1.5deg) scaleX(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.22s cubic-bezier(0.23, 1, 0.32, 1) both",
        "pop-in": "pop-in 0.18s cubic-bezier(0.23, 1, 0.32, 1) both",
        shimmer: "shimmer 1.4s linear infinite",
        strike: "strike 0.5s cubic-bezier(.22,1,.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
