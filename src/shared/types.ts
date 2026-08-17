export const requestStatuses = [
  "pending",
  "completed",
  "denied",
  "expired",
  "interrupted",
  "cancelled"
] as const;

export type RequestStatus = (typeof requestStatuses)[number];

export type TerminalOutcome = Exclude<RequestStatus, "pending">;

export interface ProviderPayload {
  provider: string;
  action: string;
  url: string;
  deviceCode?: string;
  instructions?: string;
  expiresInSeconds: number;
}

export interface DurableRequest {
  schemaVersion: 1;
  id: string;
  kind: "provider";
  status: RequestStatus;
  createdAt: string;
  expiresAt: string;
  finishedAt?: string;
  outcome?: TerminalOutcome;
}

export interface PublicRequest extends DurableRequest {
  provider?: string;
  action?: string;
  providerHost?: string;
}

export interface PrivateRequest extends PublicRequest {
  url?: string;
  deviceCode?: string;
  instructions?: string;
  actionNonce?: string;
}

export interface RuntimeConfig {
  schemaVersion: 1;
  port: number;
  allowedLogins: string[];
  publicBaseUrl: string | null;
}

export interface IpcRequest {
  command: string;
  id?: string;
  payload?: unknown;
}

export interface IpcResponse {
  ok: boolean;
  result?: unknown;
  error?: string;
}
