import { randomUUID } from "node:crypto";
import type { RequestStore } from "./store.js";
import { validateProviderPayload, validateRequestId } from "../shared/validation.js";
import type { DurableRequest, PrivateRequest, ProviderPayload, PublicRequest, TerminalOutcome } from "../shared/types.js";

interface SensitiveDetails {
  provider: string;
  action: string;
  url: string;
  deviceCode?: string;
  instructions?: string;
}

export class RequestManager {
  readonly requests = new Map<string, DurableRequest>();
  readonly details = new Map<string, SensitiveDetails>();

  constructor(
    readonly store: RequestStore,
    readonly now: () => number = () => Date.now()
  ) {
    const restored = store.load();
    let changed = false;
    for (const request of restored) {
      if (request.status === "pending") {
        request.status = "interrupted";
        request.outcome = "interrupted";
        request.finishedAt = new Date(this.now()).toISOString();
        changed = true;
      }
      this.requests.set(request.id, request);
    }
    if (changed) this.persist();
  }

  createProvider(input: unknown): PublicRequest {
    this.expire();
    const payload: ProviderPayload = validateProviderPayload(input);
    const createdAt = this.now();
    const request: DurableRequest = {
      schemaVersion: 1,
      id: randomUUID(),
      kind: "provider",
      status: "pending",
      createdAt: new Date(createdAt).toISOString(),
      expiresAt: new Date(createdAt + payload.expiresInSeconds * 1000).toISOString()
    };
    const sensitive: SensitiveDetails = {
      provider: payload.provider,
      action: payload.action,
      url: payload.url
    };
    if (payload.deviceCode !== undefined) sensitive.deviceCode = payload.deviceCode;
    if (payload.instructions !== undefined) sensitive.instructions = payload.instructions;
    this.requests.set(request.id, request);
    this.details.set(request.id, sensitive);
    this.persist();
    return this.publicRequest(request);
  }

  list(): PublicRequest[] {
    this.expire();
    return [...this.requests.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((request) => this.publicRequest(request));
  }

  get(id: unknown): PublicRequest | null {
    this.expire();
    const request = this.requests.get(validateRequestId(id));
    return request ? this.publicRequest(request) : null;
  }

  privateRequest(id: unknown): PrivateRequest | null {
    this.expire();
    const request = this.requests.get(validateRequestId(id));
    if (!request) return null;
    const result: PrivateRequest = { ...this.publicRequest(request) };
    const details = this.details.get(request.id);
    if (details && request.status === "pending") {
      result.provider = details.provider;
      result.action = details.action;
      result.providerHost = new URL(details.url).hostname;
      result.url = details.url;
      if (details.deviceCode !== undefined) result.deviceCode = details.deviceCode;
      if (details.instructions !== undefined) result.instructions = details.instructions;
    }
    return result;
  }

  finish(id: unknown, outcome: TerminalOutcome): PublicRequest | null {
    if (!["completed", "denied", "cancelled"].includes(outcome)) {
      throw new Error("terminal outcome is unsupported");
    }
    this.expire();
    const request = this.requests.get(validateRequestId(id));
    if (!request || request.status !== "pending") return null;
    request.status = outcome;
    request.outcome = outcome;
    request.finishedAt = new Date(this.now()).toISOString();
    this.details.delete(request.id);
    this.persist();
    return this.publicRequest(request);
  }

  expire(): void {
    const now = this.now();
    let changed = false;
    for (const request of this.requests.values()) {
      if (request.status === "pending" && Date.parse(request.expiresAt) <= now) {
        request.status = "expired";
        request.outcome = "expired";
        request.finishedAt = new Date(now).toISOString();
        this.details.delete(request.id);
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  private publicRequest(request: DurableRequest): PublicRequest {
    const result: PublicRequest = { ...request };
    const details = this.details.get(request.id);
    if (details && request.status === "pending") {
      result.provider = details.provider;
      result.action = details.action;
      result.providerHost = new URL(details.url).hostname;
    }
    return result;
  }

  private persist(): void {
    this.store.save([...this.requests.values()]);
  }
}
