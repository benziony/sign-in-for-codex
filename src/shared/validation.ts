import { requestStatuses, type DurableRequest, type ProviderPayload, type RuntimeConfig } from "./types.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], name: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${name} contains unsupported field ${key}`);
  }
}

function text(value: unknown, name: string, maximumLength: number): string {
  if (typeof value !== "string") throw new Error(`${name} must be text`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) throw new Error(`${name} is invalid`);
  if ([...normalized].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127;
  })) {
    throw new Error(`${name} contains control characters`);
  }
  return normalized;
}

function optionalText(value: unknown, name: string, maximumLength: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return text(value, name, maximumLength);
}

export function validateProviderPayload(value: unknown): ProviderPayload {
  const input = object(value, "provider request");
  exactKeys(
    input,
    ["provider", "action", "url", "deviceCode", "instructions", "expiresInSeconds"],
    "provider request"
  );
  const parsedUrl = new URL(text(input.url, "provider URL", 4096));
  if (parsedUrl.protocol !== "https:") throw new Error("provider URL must use HTTPS");
  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("provider URL must not contain username or password data");
  }
  const seconds = Number(input.expiresInSeconds);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86_400) {
    throw new Error("expiresInSeconds must be between 60 and 86400");
  }
  const payload: ProviderPayload = {
    provider: text(input.provider, "provider", 96),
    action: text(input.action, "action", 240),
    url: parsedUrl.href,
    expiresInSeconds: seconds
  };
  const deviceCode = optionalText(input.deviceCode, "device code", 128);
  const instructions = optionalText(input.instructions, "instructions", 600);
  if (deviceCode !== undefined) payload.deviceCode = deviceCode;
  if (instructions !== undefined) payload.instructions = instructions;
  return payload;
}

export function validateDurableRequest(value: unknown): DurableRequest {
  const input = object(value, "stored request");
  exactKeys(
    input,
    ["schemaVersion", "id", "kind", "status", "createdAt", "expiresAt", "finishedAt", "outcome"],
    "stored request"
  );
  if (input.schemaVersion !== 1 || input.kind !== "provider") {
    throw new Error("stored request schema is unsupported");
  }
  const id = text(input.id, "request ID", 64);
  if (!uuidPattern.test(id)) throw new Error("stored request ID is invalid");
  const status = text(input.status, "request status", 32);
  if (!requestStatuses.includes(status as DurableRequest["status"])) {
    throw new Error("stored request status is invalid");
  }
  const createdAt = text(input.createdAt, "createdAt", 64);
  const expiresAt = text(input.expiresAt, "expiresAt", 64);
  if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(expiresAt))) {
    throw new Error("stored request timestamps are invalid");
  }
  const request: DurableRequest = {
    schemaVersion: 1,
    id,
    kind: "provider",
    status: status as DurableRequest["status"],
    createdAt,
    expiresAt
  };
  if (input.finishedAt !== undefined) {
    request.finishedAt = text(input.finishedAt, "finishedAt", 64);
  }
  if (input.outcome !== undefined) {
    const outcome = text(input.outcome, "outcome", 32);
    if (outcome === "pending" || !requestStatuses.includes(outcome as DurableRequest["status"])) {
      throw new Error("stored request outcome is invalid");
    }
    request.outcome = outcome as NonNullable<DurableRequest["outcome"]>;
  }
  if (request.status === "pending" && (request.finishedAt || request.outcome)) {
    throw new Error("pending stored request cannot have a terminal outcome");
  }
  return request;
}

export function validateRuntimeConfig(value: unknown): RuntimeConfig {
  const input = object(value, "runtime config");
  exactKeys(input, ["schemaVersion", "port", "allowedLogins", "publicBaseUrl"], "runtime config");
  if (input.schemaVersion !== 1) throw new Error("runtime config schema is unsupported");
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("runtime port is invalid");
  }
  if (!Array.isArray(input.allowedLogins)) throw new Error("allowedLogins must be an array");
  const allowedLogins = [...new Set(input.allowedLogins.map((entry) => text(entry, "allowed login", 320).toLowerCase()))];
  let publicBaseUrl: string | null = null;
  if (input.publicBaseUrl !== null && input.publicBaseUrl !== undefined && input.publicBaseUrl !== "") {
    const url = new URL(text(input.publicBaseUrl, "publicBaseUrl", 2048));
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("publicBaseUrl must be an HTTPS origin");
    }
    publicBaseUrl = url.origin;
  }
  return { schemaVersion: 1, port, allowedLogins, publicBaseUrl };
}

export function validateRequestId(value: unknown): string {
  const id = text(value, "request ID", 64);
  if (!uuidPattern.test(id)) throw new Error("request ID is invalid");
  return id;
}
