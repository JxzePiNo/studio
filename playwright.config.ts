import { defineConfig } from "@playwright/test";
import path from "node:path";
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3030", browserName: "chromium", launchOptions: { channel: "chrome" } },
  webServer: {
    command: "npm.cmd run start -- --port 3030",
    url: "http://127.0.0.1:3030", reuseExistingServer: false,
    env: { DATA_DIR: path.resolve("test-results/e2e-data"), OPENAI_API_KEY: "", NEXT_PUBLIC_FIREBASE_ENABLED: "false", MARGINE_E2E: "true" },
  },
});
