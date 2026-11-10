import { spawnSync } from "node:child_process";

// Keep browser tests local, regardless of the configured Firebase account,
// and leave the normal development/production build untouched.
const env = { ...process.env, MARGINE_E2E: "true", NEXT_PUBLIC_FIREBASE_ENABLED: "false", OPENAI_API_KEY: "" };
for (const args of [
  ["scripts/copy-worker.mjs"],
  ["node_modules/next/dist/bin/next", "build"],
  ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
}
