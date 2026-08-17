import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ensurePrivateDirectory, runtimePaths } from "./daemon/paths.js";
import { sendIpc } from "./daemon/ipc.js";
import { validateRuntimeConfig } from "./shared/validation.js";
import type { RuntimeConfig } from "./shared/types.js";

const label = "io.github.benziony.sign-in-for-codex";

interface InstallManifest {
  schemaVersion: 1;
  root: string;
  versionDirectory: string;
  launchAgent: string;
  skillLink: string;
  skillTarget: string;
}

function launchAgentsDirectory(): string {
  return process.env.SIGN_IN_FOR_CODEX_LAUNCH_AGENTS_DIR
    ? path.resolve(process.env.SIGN_IN_FOR_CODEX_LAUNCH_AGENTS_DIR)
    : path.join(os.homedir(), "Library", "LaunchAgents");
}

function skillsDirectory(): string {
  return process.env.SIGN_IN_FOR_CODEX_SKILLS_DIR
    ? path.resolve(process.env.SIGN_IN_FOR_CODEX_SKILLS_DIR)
    : path.join(process.env.CODEX_HOME ? path.resolve(process.env.CODEX_HOME) : path.join(os.homedir(), ".codex"), "skills");
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function unusedPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("could not allocate loopback port"));
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function writePrivateJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function packageVersion(packageRoot: string): string {
  const parsed = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")) as { version?: unknown };
  if (typeof parsed.version !== "string" || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(parsed.version)) {
    throw new Error("package version is invalid");
  }
  return parsed.version;
}

function copyPackage(packageRoot: string, destination: string): void {
  const entries = ["dist", "public", "integrations", "docs", "package.json", "LICENSE", "NOTICE", "README.md", "SECURITY.md", "PROVENANCE.md"];
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.mkdirSync(temporary, { recursive: true, mode: 0o700 });
  for (const entry of entries) {
    const source = path.join(packageRoot, entry);
    if (!fs.existsSync(source)) throw new Error(`package is missing ${entry}`);
    fs.cpSync(source, path.join(temporary, entry), { recursive: true, dereference: false });
  }
  if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
  fs.renameSync(temporary, destination);
}

function launchctl(args: string[], allowFailure = false): void {
  const result = spawnSync("/bin/launchctl", args, { encoding: "utf8" });
  if (!allowFailure && (result.status !== 0 || result.error)) {
    throw new Error(result.stderr.trim() || result.error?.message || "launchctl failed");
  }
}

function userId(): number {
  if (typeof process.getuid !== "function") throw new Error("could not determine the current macOS user");
  return process.getuid();
}

function lstatIfPresent(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function assertUnder(child: string, root: string, name: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(child));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${name} is outside its owned root`);
  }
}

async function waitForDaemon(socketPath: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await sendIpc(socketPath, { command: "health" });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`installed daemon did not become healthy: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
}

export async function install(packageRoot: string): Promise<InstallManifest> {
  if (process.platform !== "darwin") throw new Error("Sign In for Codex currently supports macOS only");
  process.umask(0o077);
  const paths = runtimePaths();
  ensurePrivateDirectory(paths.root);
  const version = packageVersion(packageRoot);
  const versionsRoot = path.join(paths.root, "versions");
  ensurePrivateDirectory(versionsRoot);
  const versionDirectory = path.join(versionsRoot, version);
  assertUnder(versionDirectory, versionsRoot, "version directory");
  copyPackage(packageRoot, versionDirectory);

  let config: RuntimeConfig;
  if (fs.existsSync(paths.config)) {
    config = validateRuntimeConfig(JSON.parse(fs.readFileSync(paths.config, "utf8")) as unknown);
  } else {
    config = { schemaVersion: 1, port: await unusedPort(), allowedLogins: [], publicBaseUrl: null };
    writePrivateJson(paths.config, config);
  }

  const launchDirectory = launchAgentsDirectory();
  fs.mkdirSync(launchDirectory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(launchDirectory).isSymbolicLink()) {
    throw new Error("refusing to install through a symbolic-link LaunchAgents directory");
  }
  const launchAgent = path.join(launchDirectory, `${label}.plist`);
  const executable = path.join(versionDirectory, "dist", "cli", "index.js");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(executable)}</string>
    <string>daemon</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>SIGN_IN_FOR_CODEX_HOME</key><string>${xml(paths.root)}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>/dev/null</string>
  <key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>
`;
  if (fs.existsSync(launchAgent) && !fs.readFileSync(launchAgent, "utf8").includes(`<string>${label}</string>`)) {
    throw new Error("refusing to overwrite an unowned LaunchAgent");
  }
  fs.writeFileSync(launchAgent, plist, { mode: 0o600 });
  fs.chmodSync(launchAgent, 0o600);

  const skillRoot = skillsDirectory();
  fs.mkdirSync(skillRoot, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(skillRoot).isSymbolicLink()) {
    throw new Error("refusing to install through a symbolic-link skills directory");
  }
  const skillLink = path.join(skillRoot, "sign-in-for-codex");
  const skillTarget = path.join(versionDirectory, "integrations", "codex-skill", "sign-in-for-codex");
  const existingSkill = lstatIfPresent(skillLink);
  if (existingSkill) {
    if (!existingSkill.isSymbolicLink() || path.resolve(path.dirname(skillLink), fs.readlinkSync(skillLink)) !== skillTarget) {
      throw new Error("refusing to overwrite an existing Codex skill");
    }
    fs.unlinkSync(skillLink);
  }
  fs.symlinkSync(skillTarget, skillLink, "dir");

  const manifest: InstallManifest = {
    schemaVersion: 1,
    root: paths.root,
    versionDirectory,
    launchAgent,
    skillLink,
    skillTarget
  };
  writePrivateJson(paths.manifest, manifest);

  const domain = `gui/${userId()}`;
  launchctl(["bootout", domain, launchAgent], true);
  launchctl(["bootstrap", domain, launchAgent]);
  await waitForDaemon(paths.socket);
  return manifest;
}

function loadManifest(): InstallManifest {
  const paths = runtimePaths();
  const parsed = JSON.parse(fs.readFileSync(paths.manifest, "utf8")) as Partial<InstallManifest>;
  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.root !== "string" ||
    typeof parsed.versionDirectory !== "string" ||
    typeof parsed.launchAgent !== "string" ||
    typeof parsed.skillLink !== "string" ||
    typeof parsed.skillTarget !== "string"
  ) {
    throw new Error("installation manifest is invalid");
  }
  return parsed as InstallManifest;
}

export function uninstall(): void {
  if (process.platform !== "darwin") throw new Error("Sign In for Codex currently supports macOS only");
  const manifest = loadManifest();
  const expectedRoot = runtimePaths().root;
  if (path.resolve(manifest.root) !== path.resolve(expectedRoot) || fs.lstatSync(manifest.root).isSymbolicLink()) {
    throw new Error("installation root is not owned by Sign In for Codex");
  }
  assertUnder(manifest.versionDirectory, path.join(manifest.root, "versions"), "version directory");
  assertUnder(manifest.launchAgent, launchAgentsDirectory(), "LaunchAgent");
  assertUnder(manifest.skillLink, skillsDirectory(), "Codex skill");
  const domain = `gui/${userId()}`;
  launchctl(["bootout", domain, manifest.launchAgent], true);

  if (fs.existsSync(manifest.skillLink)) {
    const stat = fs.lstatSync(manifest.skillLink);
    if (!stat.isSymbolicLink() || path.resolve(path.dirname(manifest.skillLink), fs.readlinkSync(manifest.skillLink)) !== manifest.skillTarget) {
      throw new Error("installed Codex skill no longer points to the owned target");
    }
    fs.unlinkSync(manifest.skillLink);
  }
  if (fs.existsSync(manifest.launchAgent)) {
    if (!fs.readFileSync(manifest.launchAgent, "utf8").includes(`<string>${label}</string>`)) {
      throw new Error("LaunchAgent is no longer project-owned");
    }
    fs.unlinkSync(manifest.launchAgent);
  }
  fs.rmSync(manifest.root, { recursive: true, force: true });
}

export async function doctor(): Promise<Record<string, unknown>> {
  const paths = runtimePaths();
  const result: Record<string, unknown> = {
    ok: false,
    platform: process.platform,
    node: process.version,
    root: paths.root
  };
  try {
    const config = validateRuntimeConfig(JSON.parse(fs.readFileSync(paths.config, "utf8")) as unknown);
    const rootMode = fs.statSync(paths.root).mode & 0o777;
    const configMode = fs.statSync(paths.config).mode & 0o777;
    const socketStat = fs.statSync(paths.socket);
    const socketMode = socketStat.mode & 0o777;
    await sendIpc(paths.socket, { command: "health" });
    const response = await fetch(`http://127.0.0.1:${config.port}/health`, { signal: AbortSignal.timeout(3000) });
    Object.assign(result, {
      ok: rootMode === 0o700 && configMode === 0o600 && socketStat.isSocket() && socketMode === 0o600 && response.ok,
      listener: `127.0.0.1:${config.port}`,
      rootMode: rootMode.toString(8),
      configMode: configMode.toString(8),
      socketMode: socketMode.toString(8),
      daemon: response.ok ? "healthy" : "unhealthy",
      allowedLoginCount: config.allowedLogins.length,
      tailscaleConfigured: Boolean(config.publicBaseUrl)
    });
  } catch (error) {
    result.error = error instanceof Error ? error.message : "doctor failed";
  }
  return result;
}
