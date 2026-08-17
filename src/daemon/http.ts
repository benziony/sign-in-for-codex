import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { RuntimeConfig } from "../shared/types.js";
import { validateRequestId } from "../shared/validation.js";
import type { BrowserAuth } from "./auth.js";
import type { RequestManager } from "./requests.js";

const cookieName = "sifc_grant";
const staticFiles = new Map([
  ["/assets/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/assets/styles.css", ["styles.css", "text/css; charset=utf-8"]]
]);

function headers(contentType = "application/json; charset=utf-8", additional: Record<string, string> = {}): Record<string, string> {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    "Content-Type": contentType,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...additional
  };
}

function json(response: http.ServerResponse, status: number, value: unknown, additional: Record<string, string> = {}): void {
  response.writeHead(status, headers(undefined, additional));
  response.end(JSON.stringify(value));
}

function fail(response: http.ServerResponse, status: number, message: string): void {
  json(response, status, { error: message });
}

function cookies(request: http.IncomingMessage): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of String(request.headers.cookie ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0) result[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
  return result;
}

function setCookie(value: string, secure: boolean): string {
  return [
    `${cookieName}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=900",
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

function identity(request: http.IncomingMessage, config: RuntimeConfig): string | null {
  const raw = request.headers["tailscale-user-login"];
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return value && config.allowedLogins.includes(value) ? value : null;
}

function exactOrigin(request: http.IncomingMessage, expected: string): boolean {
  return request.headers.origin === expected;
}

function routeId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/requests\/([0-9a-f-]+)$/i);
  return match?.[1] ? validateRequestId(match[1]) : null;
}

function actionRoute(pathname: string): { id: string; action: "completed" | "denied" } | null {
  const match = pathname.match(/^\/api\/requests\/([0-9a-f-]+)\/(complete|deny)$/i);
  if (!match?.[1] || !match[2]) return null;
  return { id: validateRequestId(match[1]), action: match[2] === "complete" ? "completed" : "denied" };
}

async function readEmptyJson(request: http.IncomingMessage): Promise<void> {
  let size = 0;
  let body = "";
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 4096) throw new Error("request body is too large");
    body += chunk;
  }
  const parsed: unknown = JSON.parse(body || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length !== 0) {
    throw new Error("request body must be empty JSON");
  }
}

export async function startHttpServer(
  config: RuntimeConfig,
  requests: RequestManager,
  auth: BrowserAuth,
  publicDirectory: string
): Promise<http.Server> {
  const localOrigin = `http://127.0.0.1:${config.port}`;
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", localOrigin);
      const tailscaleIdentity = identity(request, config);
      const sessionCookie = cookies(request)[cookieName];

      if (request.method === "GET" && url.pathname.startsWith("/bootstrap/")) {
        const created = auth.consumeBootstrap(url.pathname.slice("/bootstrap/".length));
        if (!created) return fail(response, 404, "This local sign-in link is invalid or expired");
        response.writeHead(303, headers(undefined, { Location: "/", "Set-Cookie": setCookie(created.cookie, false) }));
        return response.end();
      }

      const session = auth.authorize(sessionCookie, tailscaleIdentity);
      if (!session && tailscaleIdentity && request.method === "GET" && url.pathname === "/") {
        const created = auth.createSession(tailscaleIdentity, true);
        response.writeHead(303, headers(undefined, { Location: "/", "Set-Cookie": setCookie(created.cookie, true) }));
        return response.end();
      }

      if (request.method === "GET" && staticFiles.has(url.pathname)) {
        const [file, contentType] = staticFiles.get(url.pathname) as [string, string];
        response.writeHead(200, headers(contentType));
        return response.end(fs.readFileSync(path.join(publicDirectory, file)));
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json(response, 200, { ok: true, service: "sign-in-for-codex" });
      }

      if (!session) return fail(response, 401, "Open Sign In for Codex from its local CLI or approved private connection");
      const expectedOrigin = tailscaleIdentity && config.publicBaseUrl ? config.publicBaseUrl : localOrigin;

      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, headers("text/html; charset=utf-8"));
        return response.end(fs.readFileSync(path.join(publicDirectory, "index.html")));
      }
      if (request.method === "GET" && url.pathname === "/api/session") {
        return json(response, 200, { csrf: auth.csrf(session) });
      }
      if (request.method === "GET" && url.pathname === "/api/requests") {
        return json(response, 200, { requests: requests.list() });
      }
      const id = routeId(url.pathname);
      if (request.method === "GET" && id) {
        const detail = requests.privateRequest(id);
        if (!detail) return fail(response, 404, "Sign-in request not found");
        detail.actionNonce = auth.issueAction(sessionCookie ?? "", id);
        return json(response, 200, detail);
      }
      const action = actionRoute(url.pathname);
      if (request.method === "POST" && action) {
        if (!exactOrigin(request, expectedOrigin)) return fail(response, 400, "Request origin is not allowed");
        if (!auth.checkCsrf(session, request.headers["x-csrf-token"] as string | undefined)) {
          return fail(response, 403, "Session check failed");
        }
        if (!auth.consumeAction(sessionCookie ?? "", action.id, request.headers["x-action-nonce"] as string | undefined)) {
          return fail(response, 409, "Action is no longer available");
        }
        await readEmptyJson(request);
        const finished = requests.finish(action.id, action.action);
        if (!finished) return fail(response, 409, "Sign-in request is no longer pending");
        return json(response, 200, { id: finished.id, status: finished.status, outcome: finished.outcome });
      }
      return fail(response, 404, "Not found");
    } catch (error) {
      const message = error instanceof Error && /invalid|must|unsupported|too large|origin/i.test(error.message)
        ? error.message
        : "Sign In for Codex could not complete the request";
      return fail(response, 400, message);
    }
  });
  server.on("clientError", (_error, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "127.0.0.1", () => resolve());
  });
  return server;
}
