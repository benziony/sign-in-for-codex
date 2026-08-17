import assert from "node:assert/strict";
import test from "node:test";
import { validateProviderPayload, validateRuntimeConfig } from "../src/shared/validation.js";

test("accepts a bounded provider-native approval payload", () => {
  assert.deepEqual(validateProviderPayload({
    provider: "Example Cloud",
    action: "Approve access to the project",
    url: "https://login.example.test/device",
    deviceCode: "ABCD-EFGH",
    instructions: "Use your normal account.",
    expiresInSeconds: 600
  }), {
    provider: "Example Cloud",
    action: "Approve access to the project",
    url: "https://login.example.test/device",
    deviceCode: "ABCD-EFGH",
    instructions: "Use your normal account.",
    expiresInSeconds: 600
  });
});

test("rejects unsafe provider requests", () => {
  const base = {
    provider: "Example Cloud",
    action: "Approve access",
    url: "https://login.example.test/device",
    expiresInSeconds: 600
  };
  assert.throws(() => validateProviderPayload({ ...base, url: "http://login.example.test" }), /HTTPS/);
  assert.throws(() => validateProviderPayload({ ...base, url: "https://user:pass@login.example.test" }), /username or password/);
  assert.throws(() => validateProviderPayload({ ...base, password: "not allowed" }), /unsupported field/);
  assert.throws(() => validateProviderPayload({ ...base, expiresInSeconds: 10 }), /between 60 and 86400/);
});

test("requires a clean HTTPS origin for optional private-network access", () => {
  assert.throws(() => validateRuntimeConfig({
    schemaVersion: 1,
    port: 41234,
    allowedLogins: [],
    publicBaseUrl: "https://machine.example.test/path"
  }), /HTTPS origin/);
});
