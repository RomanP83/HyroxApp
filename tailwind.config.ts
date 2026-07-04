import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0b0f14",
        surface: "#141b24",
        surface2: "#1c2733",
        line: "#26333f",
        ink: "#e8eef3",
        muted: "#8fa1b0",
        accent: "#ff5a1f",
        accent2: "#ffb020",
        ok: "#3ecf8e",
        warn: "#ffb020",
        danger: "#f26d6d",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
