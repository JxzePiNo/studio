import assert from "node:assert/strict";
import test from "node:test";
import { deleteApp } from "firebase/app";
import { browserAuth } from "../lib/firebase-client";

test("auth proxy keeps the browser's domain while default auth keeps the Firebase helper domain", async () => {
  const originalDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const originalProxy = process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY;
  const originalApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "test-project.firebaseapp.com";
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-api-key";
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { host: "studio.example.test" } } });
  try {
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY = "false";
    const directAuth = browserAuth();
    assert.equal(directAuth.app.options.authDomain, "test-project.firebaseapp.com");
    await deleteApp(directAuth.app);

    process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY = "true";
    const proxyAuth = browserAuth();
    assert.equal(proxyAuth.app.options.authDomain, "studio.example.test");
    assert.equal(browserAuth(), proxyAuth, "reuses the existing Firebase app");
    await deleteApp(proxyAuth.app);
  } finally {
    for (const [key, value] of Object.entries({
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: originalDomain,
      NEXT_PUBLIC_FIREBASE_AUTH_PROXY: originalProxy,
      NEXT_PUBLIC_FIREBASE_API_KEY: originalApiKey,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
