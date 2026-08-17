import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
fs.rmSync(path.join(root, "dist"), { recursive: true, force: true });
const result = spawnSync(process.execPath, [path.join(root, "node_modules", "typescript", "bin", "tsc")], {
  cwd: root,
  stdio: "inherit"
});
if (result.status !== 0) process.exit(result.status ?? 1);
fs.chmodSync(path.join(root, "dist", "cli", "index.js"), 0o755);
