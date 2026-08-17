#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runDaemon } from "../daemon/index.js";
import { runtimePaths } from "../daemon/paths.js";
import { sendIpc } from "../daemon/ipc.js";
import { doctor, install, uninstall } from "../installer.js";

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const packageRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

function usage(): void {
  console.log(`Sign In for Codex

Finish the sign-ins Codex gets stuck on without pasting passwords into chat.

Commands:
  sign-in-for-codex install
  sign-in-for-codex uninstall
  sign-in-for-codex doctor [--json]
  sign-in-for-codex daemon
  sign-in-for-codex open
  sign-in-for-codex request provider --stdin [--wait]
  sign-in-for-codex wait REQUEST_ID [--timeout SECONDS] [--json]
  sign-in-for-codex cancel REQUEST_ID

Provider URLs, device codes, and instructions are accepted only through stdin.`);
}

function option(name: string, fallback: string | null = null): string | null {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
}

function safeLifecycle(value: unknown): { id: string; status: string; outcome?: string; expiresAt?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("daemon returned an invalid lifecycle result");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.status !== "string") throw new Error("daemon returned an invalid lifecycle result");
  const result: { id: string; status: string; outcome?: string; expiresAt?: string } = { id: record.id, status: record.status };
  if (typeof record.outcome === "string") result.outcome = record.outcome;
  if (typeof record.expiresAt === "string") result.expiresAt = record.expiresAt;
  return result;
}

async function waitFor(id: string, timeoutSeconds: number): Promise<ReturnType<typeof safeLifecycle>> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const result = safeLifecycle(await sendIpc(runtimePaths().socket, { command: "get", id }));
    if (result.status !== "pending") return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("wait timed out; the sign-in request remains available until its own expiry");
}

async function main(): Promise<void> {
  if (command === "help" || args.includes("--help") || args.includes("-h")) return usage();
  if (command === "daemon") return await runDaemon();
  if (command === "install") {
    const manifest = await install(packageRoot);
    console.log(`Installed Sign In for Codex ${path.basename(manifest.versionDirectory)}.`);
    console.log("Run: sign-in-for-codex open");
    return;
  }
  if (command === "uninstall") {
    uninstall();
    console.log("Sign In for Codex was removed.");
    return;
  }
  if (command === "doctor") {
    const result = await doctor();
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(result.ok ? "Sign In for Codex is healthy." : `Sign In for Codex is not healthy: ${String(result.error ?? "check failed")}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (command === "open") {
    const result = await sendIpc(runtimePaths().socket, { command: "bootstrap" });
    if (!result || typeof result !== "object" || typeof (result as { url?: unknown }).url !== "string") {
      throw new Error("daemon did not return a local opening link");
    }
    const opened = spawnSync("/usr/bin/open", [(result as { url: string }).url], { stdio: "ignore" });
    if (opened.status !== 0 || opened.error) throw new Error("could not open the local sign-in page");
    console.log("Opened Sign In for Codex in your browser.");
    return;
  }
  if (command === "request" && args[1] === "provider") {
    if (!args.includes("--stdin")) throw new Error("provider requests require --stdin");
    if (args.some((entry) => ["--url", "--code", "--secret", "--password"].includes(entry))) {
      throw new Error("sensitive provider details are not accepted in command arguments");
    }
    const input = fs.readFileSync(0);
    if (input.length === 0 || input.length > 16 * 1024) throw new Error("provider request stdin is missing or too large");
    const payload: unknown = JSON.parse(input.toString("utf8"));
    const created = safeLifecycle(await sendIpc(runtimePaths().socket, { command: "create-provider", payload }));
    console.log(JSON.stringify(created));
    if (args.includes("--wait")) {
      const expiresAt = created.expiresAt ? Date.parse(created.expiresAt) : Date.now() + 900_000;
      const timeout = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
      console.log(JSON.stringify(await waitFor(created.id, timeout)));
    }
    return;
  }
  if (command === "wait") {
    const id = args[1];
    if (!id) throw new Error("wait requires a request ID");
    const parsedTimeout = Number(option("timeout", "900"));
    if (!Number.isInteger(parsedTimeout) || parsedTimeout < 1 || parsedTimeout > 86_400) {
      throw new Error("timeout must be between 1 and 86400 seconds");
    }
    const result = await waitFor(id, parsedTimeout);
    console.log(args.includes("--json") ? JSON.stringify(result) : `${result.id}: ${result.status}`);
    return;
  }
  if (command === "cancel") {
    const id = args[1];
    if (!id) throw new Error("cancel requires a request ID");
    console.log(JSON.stringify(safeLifecycle(await sendIpc(runtimePaths().socket, { command: "cancel", id }))));
    return;
  }
  usage();
  process.exitCode = 64;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Sign In for Codex failed");
  process.exitCode = 1;
});
