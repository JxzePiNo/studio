import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "../next.config";

test("auth helper rewrite is opt-in and only targets a fixed Firebase project hostname", async () => {
  const originalFlag = process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY;
  const originalDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  try {
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY = "false";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "";
    assert.deepEqual(await nextConfig.rewrites!(), []);

    process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY = "true";
    for (const domain of ["my-project.firebaseapp.com", "my-project.web.app"]) {
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = domain;
      assert.deepEqual(await nextConfig.rewrites!(), [{
        source: "/__/auth/:path*",
        destination: `https://${domain}/__/auth/:path*`,
      }]);
    }
    for (const invalid of ["", "https://my-project.firebaseapp.com", "my-project.firebaseapp.com/path", "my-project.firebaseapp.com:443", "my-project.firebaseapp.com.evil.test", "my-project.firebaseapp.com@evil.test", "127.0.0.1", "my-project.firebaseapp.com?host=evil.test"]) {
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = invalid;
      assert.throws(() => nextConfig.rewrites!(), /Firebase auth proxy requires/);
    }
  } finally {
    if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY;
    else process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY = originalFlag;
    if (originalDomain === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
    else process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = originalDomain;
  }
});
