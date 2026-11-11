import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { JWT } from "google-auth-library";
import { createGoogleServices } from "../lib/google-services";

test("Google services use an explicit service-account client without deprecated credentials options", async t => {
  const warnings: string[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args.join(" ")); });
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const services = createGoogleServices({ projectId: "test-project", email: "test@test-project.iam.gserviceaccount.com", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString() });
  const client = await services.storage.authClient.getClient();
  assert.ok(client instanceof JWT);
  assert.equal(client.email, "test@test-project.iam.gserviceaccount.com");
  assert.deepEqual(client.scopes, ["https://www.googleapis.com/auth/cloud-platform"]);
  assert.ok(!warnings.some(warning => warning.includes("deprecated")));
  await services.db.terminate();
});
