import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserAuth } from "./auth.js";
import { startHttpServer } from "./http.js";
import { startIpcServer } from "./ipc.js";
import { ensurePrivateDirectory, loadRuntimeConfig, runtimePaths } from "./paths.js";
import { RequestManager } from "./requests.js";
import { RequestStore } from "./store.js";

export async function runDaemon(): Promise<void> {
  process.umask(0o077);
  const paths = runtimePaths();
  ensurePrivateDirectory(paths.root);
  const config = loadRuntimeConfig(paths);
  const manager = new RequestManager(new RequestStore(paths.ledger));
  const auth = new BrowserAuth();
  const packageRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
  const publicDirectory = path.join(packageRoot, "public");
  const webOrigin = `http://127.0.0.1:${config.port}`;
  const httpServer = await startHttpServer(config, manager, auth, publicDirectory);
  const ipcServer = await startIpcServer(paths.socket, manager, auth, webOrigin);

  const stop = (): void => {
    ipcServer.close();
    httpServer.close();
    if (fs.existsSync(paths.socket) && fs.lstatSync(paths.socket).isSocket()) fs.unlinkSync(paths.socket);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
