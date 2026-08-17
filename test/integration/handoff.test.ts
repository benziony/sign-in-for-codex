import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BrowserAuth } from "../../src/daemon/auth.js";
import { startHttpServer } from "../../src/daemon/http.js";
import { sendIpc, startIpcServer } from "../../src/daemon/ipc.js";
import { RequestManager } from "../../src/daemon/requests.js";
import { RequestStore } from "../../src/daemon/store.js";
import type { RuntimeConfig } from "../../src/shared/types.js";

async function unusedPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("missing TCP test address"));
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function cookie(response: Response): string {
  const value = response.headers.get("set-cookie");
  assert.ok(value);
  return value.split(";", 1)[0] ?? "";
}

test("agent handoff completes through an authenticated browser session", async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sign-in-for-codex-integration-"));
  const socket = path.join(root, "agent.sock");
  const port = await unusedPort();
  const origin = `http://127.0.0.1:${port}`;
  const config: RuntimeConfig = { schemaVersion: 1, port, allowedLogins: [], publicBaseUrl: null };
  const manager = new RequestManager(new RequestStore(path.join(root, "requests.json")));
  const auth = new BrowserAuth();
  const httpServer = await startHttpServer(config, manager, auth, path.join(process.cwd(), "public"));
  const ipcServer = await startIpcServer(socket, manager, auth, origin);
  context.after(async () => {
    await new Promise<void>((resolve) => ipcServer.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  });

  const created = await sendIpc(socket, {
    command: "create-provider",
    payload: {
      provider: "Example Cloud",
      action: "Approve access",
      url: "https://login.example.test/device",
      deviceCode: "ABCD-EFGH",
      expiresInSeconds: 600
    }
  }) as { id: string; status: string };
  assert.equal(created.status, "pending");

  const opened = await sendIpc(socket, { command: "bootstrap" }) as { url: string };
  const bootstrap = await fetch(opened.url, { redirect: "manual" });
  assert.equal(bootstrap.status, 303);
  const sessionCookie = cookie(bootstrap);

  const sessionResponse = await fetch(`${origin}/api/session`, { headers: { Cookie: sessionCookie } });
  assert.equal(sessionResponse.status, 200);
  const session = await sessionResponse.json() as { csrf: string };
  const detailResponse = await fetch(`${origin}/api/requests/${created.id}`, { headers: { Cookie: sessionCookie } });
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json() as { deviceCode: string; actionNonce: string; url: string };
  assert.equal(detail.deviceCode, "ABCD-EFGH");
  assert.equal(detail.url, "https://login.example.test/device");

  const missingOrigin = await fetch(`${origin}/api/requests/${created.id}/complete`, {
    method: "POST",
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.csrf,
      "X-Action-Nonce": detail.actionNonce
    },
    body: "{}"
  });
  assert.equal(missingOrigin.status, 400);
  assert.equal((await sendIpc(socket, { command: "get", id: created.id }) as { status: string }).status, "pending");

  const refreshed = await fetch(`${origin}/api/requests/${created.id}`, { headers: { Cookie: sessionCookie } });
  const newDetail = await refreshed.json() as { actionNonce: string };
  const completed = await fetch(`${origin}/api/requests/${created.id}/complete`, {
    method: "POST",
    headers: {
      Cookie: sessionCookie,
      Origin: origin,
      "Content-Type": "application/json",
      "X-CSRF-Token": session.csrf,
      "X-Action-Nonce": newDetail.actionNonce
    },
    body: "{}"
  });
  assert.equal(completed.status, 200);
  assert.equal((await sendIpc(socket, { command: "get", id: created.id }) as { status: string }).status, "completed");
});
