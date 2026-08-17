import assert from "node:assert/strict";
import test from "node:test";
import { BrowserAuth } from "../src/daemon/auth.js";

test("keeps separately issued action nonces valid once and only once", () => {
  let now = 1_800_000_000_000;
  const auth = new BrowserAuth(() => now);
  const session = auth.createSession("local", false);
  const first = auth.issueAction(session.cookie, "request-id");
  const second = auth.issueAction(session.cookie, "request-id");

  assert.equal(auth.consumeAction(session.cookie, "request-id", first), true);
  assert.equal(auth.consumeAction(session.cookie, "request-id", first), false);
  assert.equal(auth.consumeAction(session.cookie, "request-id", second), true);

  const expired = auth.issueAction(session.cookie, "request-id");
  now += 60_001;
  assert.equal(auth.consumeAction(session.cookie, "request-id", expired), false);
});
