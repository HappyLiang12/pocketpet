import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  // The specs share one bridge server and host state, so run files serially.
  workers: 1,
  use: { baseURL: "http://127.0.0.1:7799", locale: "zh-TW" },
  webServer: {
    command: "node e2e/prepare.mjs && node dist/cli.js run",
    url: "http://127.0.0.1:7799/health",
    reuseExistingServer: false,
    timeout: 30_000,
    env: { POCKETPET_HOME: ".tmp-e2e" },
  },
});
