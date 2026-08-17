import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateRuntimeConfig } from "../shared/validation.js";
import type { RuntimeConfig } from "../shared/types.js";

export interface RuntimePaths {
  root: string;
  config: string;
  ledger: string;
  socket: string;
  manifest: string;
}

export function runtimeRoot(): string {
  const override = process.env.SIGN_IN_FOR_CODEX_HOME;
  return override
    ? path.resolve(override)
    : path.join(os.homedir(), "Library", "Application Support", "sign-in-for-codex");
}

export function runtimePaths(root = runtimeRoot()): RuntimePaths {
  const resolved = path.resolve(root);
  return {
    root: resolved,
    config: path.join(resolved, "config.json"),
    ledger: path.join(resolved, "requests.json"),
    socket: path.join(resolved, "agent.sock"),
    manifest: path.join(resolved, "install-manifest.json")
  };
}

export function ensurePrivateDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("refusing to use a non-private runtime directory");
  }
  fs.chmodSync(directory, 0o700);
}

export function loadRuntimeConfig(paths = runtimePaths()): RuntimeConfig {
  const parsed: unknown = JSON.parse(fs.readFileSync(paths.config, "utf8"));
  return validateRuntimeConfig(parsed);
}
