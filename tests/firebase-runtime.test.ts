import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("Firebase Admin and JWKS signing keys work without require(ESM) interop", () => {
  const script = `
    const assert = require('node:assert/strict');
    const { createRequire } = require('node:module');
    const { generateKeyPairSync, sign, verify } = require('node:crypto');
    assert.equal(process.features.require_module, false);
    assert.equal(typeof require('firebase-admin/auth').getAuth, 'function');
    const adminRequire = createRequire(require.resolve('firebase-admin/auth'));
    const jwksRequire = createRequire(adminRequire.resolve('jwks-rsa'));
    const { retrieveSigningKeys } = jwksRequire('./utils.js');
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const payload = Buffer.from('firebase-runtime-regression-test');
    const signature = sign('sha256', payload, pair.privateKey);
    retrieveSigningKeys([{ ...pair.publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' }])
      .then(keys => {
        assert.equal(keys.length, 1);
        assert.equal(keys[0].kid, 'test-key');
        assert.equal(verify('sha256', payload, keys[0].getPublicKey(), signature), true);
        console.log('Firebase auth and JWKS verification OK');
      }).catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ["--no-experimental-require-module", "-e", script], { encoding: "utf8", timeout: 20000, env: { ...process.env, NODE_OPTIONS: "" } });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Firebase auth and JWKS verification OK/);
});
