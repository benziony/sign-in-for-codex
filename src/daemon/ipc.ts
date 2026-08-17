import fs from "node:fs";
import net from "node:net";
import type { AddressInfo } from "node:net";
import type { RequestManager } from "./requests.js";
import type { BrowserAuth } from "./auth.js";
import type { IpcRequest, IpcResponse } from "../shared/types.js";

const maximumMessageBytes = 16 * 1024;

function response(socket: net.Socket, value: IpcResponse): void {
  socket.end(`${JSON.stringify(value)}\n`);
}

function safeResult(request: ReturnType<RequestManager["get"]>): unknown {
  if (!request) return null;
  return {
    id: request.id,
    status: request.status,
    expiresAt: request.expiresAt,
    finishedAt: request.finishedAt,
    outcome: request.outcome
  };
}

export async function startIpcServer(
  socketPath: string,
  requests: RequestManager,
  auth: BrowserAuth,
  webOrigin: string
): Promise<net.Server> {
  if (fs.existsSync(socketPath)) {
    const existing = fs.lstatSync(socketPath);
    if (!existing.isSocket()) throw new Error("refusing to replace non-socket agent path");
    fs.unlinkSync(socketPath);
  }
  const server = net.createServer((socket) => {
    socket.setTimeout(10_000, () => socket.destroy());
    let input = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      input = Buffer.concat([input, chunk]);
      if (input.length > maximumMessageBytes) socket.destroy(new Error("agent message is too large"));
      if (!input.includes(0x0a)) return;
      try {
        const parsed: unknown = JSON.parse(input.toString("utf8").split("\n", 1)[0] ?? "");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("agent message must be an object");
        }
        const message = parsed as IpcRequest;
        if (message.command === "health") {
          response(socket, { ok: true, result: { status: "ok" } });
        } else if (message.command === "bootstrap") {
          response(socket, {
            ok: true,
            result: { url: `${webOrigin}/bootstrap/${auth.createBootstrap()}` }
          });
        } else if (message.command === "create-provider") {
          const created = requests.createProvider(message.payload);
          response(socket, { ok: true, result: safeResult(created) });
        } else if (message.command === "get") {
          response(socket, { ok: true, result: safeResult(requests.get(message.id)) });
        } else if (message.command === "list") {
          response(socket, { ok: true, result: requests.list().map((item) => safeResult(item)) });
        } else if (message.command === "cancel") {
          response(socket, { ok: true, result: safeResult(requests.finish(message.id, "cancelled")) });
        } else {
          response(socket, { ok: false, error: "unsupported agent command" });
        }
      } catch (error) {
        response(socket, {
          ok: false,
          error: error instanceof Error ? error.message : "agent request failed"
        });
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => resolve());
  });
  fs.chmodSync(socketPath, 0o600);
  const address = server.address();
  if (typeof address !== "string" && (address as AddressInfo | null)) {
    throw new Error("agent API unexpectedly opened a TCP listener");
  }
  return server;
}

export async function sendIpc(socketPath: string, message: IpcRequest): Promise<unknown> {
  const serialized = `${JSON.stringify(message)}\n`;
  if (Buffer.byteLength(serialized) > maximumMessageBytes) throw new Error("agent message is too large");
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let output = Buffer.alloc(0);
    socket.setTimeout(10_000, () => socket.destroy(new Error("daemon request timed out")));
    socket.once("connect", () => socket.write(serialized));
    socket.on("data", (chunk: Buffer) => {
      output = Buffer.concat([output, chunk]);
      if (output.length > maximumMessageBytes) socket.destroy(new Error("daemon response is too large"));
    });
    socket.once("end", () => {
      try {
        const parsed = JSON.parse(output.toString("utf8")) as IpcResponse;
        if (!parsed.ok) throw new Error(parsed.error ?? "daemon request failed");
        resolve(parsed.result);
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}
