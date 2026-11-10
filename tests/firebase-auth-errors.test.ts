import assert from "node:assert/strict";
import test from "node:test";
import { firebaseAuthFailure, firebaseCredentialDiagnostics } from "../lib/firebase-auth-errors";

test("server OAuth credentials failing during token verification never request another login", () => {
  const failure = firebaseAuthFailure({ code: "app/invalid-credential", message: "invalid_grant: Invalid JWT Signature. PRIVATE_CONTENT" });
  assert.equal(failure.status, 503);
  assert.equal(failure.reason, "invalid-service-account-signature");
  assert.match(failure.error, /FIREBASE_CLIENT_EMAIL.*FIREBASE_PRIVATE_KEY/);
  assert.ok(!JSON.stringify(failure).includes("PRIVATE_CONTENT"));
});

test("expired, revoked or invalid user tokens remain unauthorized", () => {
  for (const code of ["auth/id-token-expired", "auth/id-token-revoked", "auth/argument-error", "auth/user-disabled", "auth/invalid-id-token"]) {
    assert.equal(firebaseAuthFailure({ code }).status, 401);
  }
  assert.equal(firebaseAuthFailure({ code: "auth/id-token-expired" }, "initialize").status, 503);
  assert.equal(firebaseAuthFailure({ code: "auth/insufficient-permission" }).status, 503);
  assert.equal(firebaseAuthFailure(new Error("unexpected failure")).status, 503);
});

test("credential diagnostics expose only source and missing variable names", () => {
  const diagnostics = firebaseCredentialDiagnostics({ GOOGLE_APPLICATION_CREDENTIALS: "C:/PRIVATE_PATH/key.json", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "PRIVATE_PROJECT" });
  assert.equal(diagnostics.credentialSource, "application-default");
  assert.deepEqual(diagnostics.missingEnvironmentVariables, ["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]);
  assert.ok(!JSON.stringify(diagnostics).includes("PRIVATE_PATH"));
  assert.ok(!JSON.stringify(diagnostics).includes("PRIVATE_PROJECT"));
  const complete = firebaseCredentialDiagnostics({ FIREBASE_CLIENT_EMAIL: "PRIVATE_EMAIL", FIREBASE_PRIVATE_KEY: "PRIVATE_KEY", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "PRIVATE_PROJECT" });
  assert.equal(complete.credentialSource, "environment-service-account");
  assert.deepEqual(complete.missingEnvironmentVariables, []);
  assert.ok(!JSON.stringify(complete).includes("PRIVATE_EMAIL"));
});
