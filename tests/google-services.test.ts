import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

test("ADC key-file credentials authorize Storage requests without a URL audience", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-adc-"));
  const file = path.join(directory, "credentials.json");
  const previous = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  t.after(async () => { if (previous === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS; else process.env.GOOGLE_APPLICATION_CREDENTIALS = previous; await rm(directory, { recursive: true, force: true }); });
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  await writeFile(file, JSON.stringify({ type: "service_account", project_id: "test-project", client_email: "test@test-project.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }));
  process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
  const services = createGoogleServices({ projectId: "test-project" });
  const client = await services.storage.authClient.getClient();
  assert.ok(client instanceof JWT);
  assert.deepEqual(client.scopes, ["https://www.googleapis.com/auth/cloud-platform"]);
  client.credentials = { access_token: "test-token-no-network", expiry_date: Date.now() + 600000 };
  const request = await services.storage.authClient.authorizeRequest({});
  assert.equal(new Headers(request.headers).get("authorization"), "Bearer test-token-no-network");
  await services.db.terminate();
});
