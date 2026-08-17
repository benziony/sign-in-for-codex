import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { RequestManager } from "../src/daemon/requests.js";
import { RequestStore } from "../src/daemon/store.js";

function fixture(now = 1_800_000_000_000): { root: string; file: string; manager: RequestManager } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sign-in-for-codex-test-"));
  const file = path.join(root, "requests.json");
  return { root, file, manager: new RequestManager(new RequestStore(file), () => now) };
}

test("persists lifecycle metadata but never provider details", (context) => {
  const { root, file, manager } = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const created = manager.createProvider({
    provider: "Example Cloud",
    action: "Approve access",
    url: "https://login.example.test/device?opaque=sensitive",
    deviceCode: "ABCD-EFGH",
    instructions: "Synthetic instructions",
    expiresInSeconds: 600
  });
  const stored = fs.readFileSync(file, "utf8");
  assert.match(stored, new RegExp(created.id));
  assert.doesNotMatch(stored, /Example Cloud|login\.example\.test|sensitive|ABCD-EFGH|Synthetic instructions/);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(manager.privateRequest(created.id)?.deviceCode, "ABCD-EFGH");
});

test("interrupts pending requests after restart and discards sensitive details", (context) => {
  const { root, file, manager } = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const created = manager.createProvider({
    provider: "Example Cloud",
    action: "Approve access",
    url: "https://login.example.test/device",
    expiresInSeconds: 600
  });
  const restarted = new RequestManager(new RequestStore(file), () => 1_800_000_001_000);
  assert.equal(restarted.get(created.id)?.status, "interrupted");
  assert.equal(restarted.privateRequest(created.id)?.url, undefined);
});

test("terminal outcomes are one way", (context) => {
  const { root, manager } = fixture();
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const created = manager.createProvider({
    provider: "Example Cloud",
    action: "Approve access",
    url: "https://login.example.test/device",
    expiresInSeconds: 600
  });
  assert.equal(manager.finish(created.id, "completed")?.status, "completed");
  assert.equal(manager.finish(created.id, "denied"), null);
  assert.equal(manager.privateRequest(created.id)?.url, undefined);
});
