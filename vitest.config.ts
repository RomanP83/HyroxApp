import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Next's tsconfig uses jsx: preserve; vitest needs the automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: {
    // Mirror the tsconfig "@/*" path alias.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    // Unit tests only — e2e/*.spec.ts belongs to Playwright (npm run e2e).
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
