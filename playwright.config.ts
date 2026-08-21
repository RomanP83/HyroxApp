import { defineConfig } from "@playwright/test";

// E2E smoke suite (Roadmap B7). Runs against a production build:
//   npm run build && npm run e2e
// PW_CHROMIUM_PATH lets constrained environments point at a pre-installed
// Chromium instead of downloading one.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3210",
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined,
  },
  webServer: {
    command: "npx next start -p 3210",
    port: 3210,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
