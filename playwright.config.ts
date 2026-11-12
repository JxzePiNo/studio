import { defineConfig } from "@playwright/test";
import path from "node:path";
const isolated = process.env.STUDIO_E2E_READER === "true";
const port = isolated ? 3037 : 3030;
export default defineConfig({
  outputDir: isolated ? "test-results-reader" : "test-results",
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: "chromium", launchOptions: { channel: "chrome" } },
  webServer: {
    command: `npm.cmd run start -- --port ${port}`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false,
    env: { DATA_DIR: path.resolve(isolated ? ".e2e-reader-data" : ".e2e-data"), OPENAI_API_KEY: "", NEXT_PUBLIC_FIREBASE_ENABLED: "false", MARGINE_E2E: "true", STUDIO_E2E_READER: isolated ? "true" : "false" },
  },
});
