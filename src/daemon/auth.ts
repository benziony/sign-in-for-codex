import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

interface Bootstrap {
  digest: Buffer;
  expiresAt: number;
}

interface Session {
  digest: Buffer;
  identity: string;
  csrf: string;
  createdAt: number;
  lastUsedAt: number;
  secure: boolean;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function sameDigest(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export class BrowserAuth {
  readonly bootstraps = new Map<string, Bootstrap>();
  readonly sessions = new Map<string, Session>();
  readonly actions = new Map<string, Buffer>();

  constructor(
    readonly now: () => number = () => Date.now(),
    readonly idleMs = 5 * 60 * 1000,
    readonly absoluteMs = 15 * 60 * 1000
  ) {}

  createBootstrap(): string {
    this.prune();
    const value = token();
    const id = token(12);
    this.bootstraps.set(id, { digest: digest(value), expiresAt: this.now() + 60_000 });
    return `${id}.${value}`;
  }

  consumeBootstrap(value: string): { cookie: string; csrf: string } | null {
    this.prune();
    const separator = value.indexOf(".");
    if (separator < 1) return null;
    const id = value.slice(0, separator);
    const secret = value.slice(separator + 1);
    const pending = this.bootstraps.get(id);
    this.bootstraps.delete(id);
    if (!pending || !sameDigest(pending.digest, digest(secret))) return null;
    return this.createSession("local", false);
  }

  createSession(identity: string, secure: boolean): { cookie: string; csrf: string } {
    this.prune();
    const cookie = token();
    const csrf = token(24);
    const key = token(12);
    const now = this.now();
    this.sessions.set(key, {
      digest: digest(cookie),
      identity,
      csrf,
      createdAt: now,
      lastUsedAt: now,
      secure
    });
    return { cookie: `${key}.${cookie}`, csrf };
  }

  authorize(value: string | undefined, identity: string | null): Session | null {
    this.prune();
    if (!value) return null;
    const separator = value.indexOf(".");
    if (separator < 1) return null;
    const key = value.slice(0, separator);
    const secret = value.slice(separator + 1);
    const session = this.sessions.get(key);
    if (!session || !sameDigest(session.digest, digest(secret))) return null;
    if (session.identity !== "local" && session.identity !== identity) return null;
    session.lastUsedAt = this.now();
    return session;
  }

  issueAction(sessionCookie: string, requestId: string): string {
    const value = token(24);
    this.actions.set(`${sessionCookie}:${requestId}`, digest(value));
    return value;
  }

  consumeAction(sessionCookie: string, requestId: string, value: string | undefined): boolean {
    const key = `${sessionCookie}:${requestId}`;
    const expected = this.actions.get(key);
    this.actions.delete(key);
    return Boolean(expected && value && sameDigest(expected, digest(value)));
  }

  checkCsrf(session: Session, value: string | undefined): boolean {
    if (!value) return false;
    return sameDigest(digest(session.csrf), digest(value));
  }

  isSecure(session: Session): boolean {
    return session.secure;
  }

  csrf(session: Session): string {
    return session.csrf;
  }

  private prune(): void {
    const now = this.now();
    for (const [key, bootstrap] of this.bootstraps) {
      if (bootstrap.expiresAt <= now) this.bootstraps.delete(key);
    }
    for (const [key, session] of this.sessions) {
      if (session.lastUsedAt + this.idleMs <= now || session.createdAt + this.absoluteMs <= now) {
        this.sessions.delete(key);
        const prefix = `${key}.`;
        for (const actionKey of this.actions.keys()) {
          if (actionKey.startsWith(prefix)) this.actions.delete(actionKey);
        }
      }
    }
  }
}
