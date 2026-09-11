import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage, type Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import type { KdfParams } from "../crypto/kdf.ts";
import type { Transaction } from "../domain/types.ts";
import { SessionError } from "../errors.ts";
import { newId, Vault, type StorageEngine } from "../vault/vault.ts";

export interface SessionServerOptions {
  vaultDir: string;
  host?: string;
  port?: number;
  tls?: { key: Buffer | string; cert: Buffer | string };
  sessionIdleMs?: number;
  sessionAbsoluteMs?: number;
  autoLockIdleMs?: number;
  unlockAttemptsPerMinute?: number;
  allowedOrigins?: string[];
  kdf?: KdfParams;
  engine?: StorageEngine;
}

interface Session {
  id: string;
  csrf: string;
  address: string;
  createdAt: number;
  lastSeenAt: number;
}

interface RouteContext {
  request: IncomingMessage;
  session: Session | null;
  body: Record<string, unknown>;
}

const COOKIE_NAME = "flowly_sid";
const MAX_BODY_BYTES = 256 * 1024;

interface NormalizedOptions {
  vaultDir: string;
  host: string;
  port: number;
  sessionIdleMs: number;
  sessionAbsoluteMs: number;
  autoLockIdleMs: number;
  unlockAttemptsPerMinute: number;
  engine: StorageEngine;
  allowedOrigins?: string[];
  tls?: { key: Buffer | string; cert: Buffer | string };
  kdf?: KdfParams;
}

export class SessionServer {
  private readonly options: NormalizedOptions;
  private readonly server: Server;
  private readonly sessions = new Map<string, Session>();
  private readonly unlockAttempts = new Map<string, number[]>();
  private vaultValue: Vault | null = null;
  private lastSessionEndedAt = Date.now();
  private sweepTimer: NodeJS.Timeout | null = null;

  private constructor(options: NormalizedOptions, server: Server) {
    this.options = options;
    this.server = server;
  }

  static async start(options: SessionServerOptions): Promise<SessionServer> {
    const normalized: NormalizedOptions = {
      vaultDir: options.vaultDir,
      host: options.host ?? "127.0.0.1",
      port: options.port ?? 0,
      sessionIdleMs: options.sessionIdleMs ?? 15 * 60 * 1000,
      sessionAbsoluteMs: options.sessionAbsoluteMs ?? 12 * 60 * 60 * 1000,
      autoLockIdleMs: options.autoLockIdleMs ?? 5 * 60 * 1000,
      unlockAttemptsPerMinute: options.unlockAttemptsPerMinute ?? 5,
      engine: options.engine ?? "sqlcipher",
      ...(options.allowedOrigins ? { allowedOrigins: options.allowedOrigins } : {}),
      ...(options.tls ? { tls: options.tls } : {}),
      ...(options.kdf ? { kdf: options.kdf } : {}),
    };
    const server = options.tls
      ? (createHttpsServer({ key: options.tls.key, cert: options.tls.cert }) as unknown as Server)
      : createHttpServer();
    const instance = new SessionServer(normalized, server);
    server.on("request", (request, response) => {
      void instance.handle(request, response).catch((error: unknown) => {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "internal_error" }));
        void error;
      });
    });
    instance.sweepTimer = setInterval(() => {
      void instance.sweep();
    }, Math.min(1000, Math.max(50, instance.options.autoLockIdleMs / 4)));
    instance.sweepTimer.unref();

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(instance.options.port, instance.options.host, () => resolve());
    });
    return instance;
  }

  get origin(): string {
    const address = this.server.address() as AddressInfo;
    const scheme = this.options.tls ? "https" : "http";
    const host = address.family === "IPv6" ? `[${address.address}]` : address.address;
    return `${scheme}://${host}:${address.port}`;
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  get vault(): Vault | null {
    return this.vaultValue;
  }

  async stop(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sessions.clear();
    if (this.vaultValue?.isUnlocked) await this.vaultValue.lock();
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
      this.server.closeAllConnections();
    });
  }

  /** Test hook: expire every session as if the browser had been idle too long. */
  expireAllSessions(): void {
    for (const session of this.sessions.values()) {
      session.lastSeenAt = 0;
    }
  }

  private async handle(request: IncomingMessage, response: import("node:http").ServerResponse) {
    const url = new URL(request.url ?? "/", this.origin);
    let body: Record<string, unknown>;
    try {
      body = await readJsonBody(request);
    } catch {
      return json(response, 413, { error: "request_too_large" });
    }
    const session = this.sessionFrom(request);
    const context: RouteContext = { request, session, body };

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json(response, 200, {
        status: "ok",
        unlocked: this.vaultValue?.isUnlocked ?? false,
        sessions: this.sessions.size,
        engine: this.vaultValue?.engine ?? null,
        cipher: this.vaultValue?.engine === "sqlcipher" ? "sqlcipher-4" : "aes-256-gcm",
      });
    }

    if (url.pathname === "/api/unlock" && request.method === "POST") {
      return this.handleUnlock(context, response);
    }

    if (!session) {
      return json(response, 401, { error: "session_required" });
    }
    session.lastSeenAt = Date.now();

    if (request.method === "POST" && !this.originAllowed(request)) {
      return json(response, 403, { error: "origin_not_allowed" });
    }
    if (request.method !== "GET" && !this.csrfValid(request, session)) {
      return json(response, 403, { error: "csrf_token_invalid" });
    }

    if (url.pathname === "/api/session" && request.method === "GET") {
      return json(response, 200, {
        csrfToken: session.csrf,
        unlocked: this.vaultValue?.isUnlocked ?? false,
        vault: this.vaultValue
          ? { vaultId: this.vaultValue.header.vaultId, engine: this.vaultValue.engine }
          : null,
      });
    }

    if (url.pathname === "/api/lock" && request.method === "POST") {
      return this.handleLock(context, response);
    }

    if (url.pathname === "/api/transactions" && request.method === "GET") {
      const vault = this.requireVault();
      const transactions = await vault.listTransactions();
      return json(response, 200, { transactions });
    }

    if (url.pathname === "/api/transactions" && request.method === "POST") {
      const vault = this.requireVault();
      const transaction = body["transaction"] as Transaction | undefined;
      if (!transaction || typeof transaction !== "object" || !transaction.id) {
        return json(response, 400, { error: "invalid_transaction" });
      }
      await vault.putTransaction(transaction);
      return json(response, 201, { id: transaction.id });
    }

    return json(response, 404, { error: "not_found" });
  }

  private async handleUnlock(
    context: RouteContext,
    response: import("node:http").ServerResponse,
  ) {
    const address = context.request.socket.remoteAddress ?? "unknown";
    if (!this.consumeUnlockAttempt(address)) {
      return json(response, 429, { error: "too_many_attempts", retryAfterMs: 60_000 });
    }
    const passphrase = context.body["passphrase"];
    if (typeof passphrase !== "string" || passphrase.length === 0) {
      return json(response, 400, { error: "passphrase_required" });
    }
    const createIfMissing = context.body["create"] === true;
    if (!Vault.exists(this.options.vaultDir) && !createIfMissing) {
      return json(response, 404, { error: "vault_not_found" });
    }
    try {
      if (!this.vaultValue?.isUnlocked) {
        this.vaultValue = Vault.exists(this.options.vaultDir)
          ? await Vault.open(this.options.vaultDir, passphrase, {
              engine: this.options.engine ?? "sqlcipher",
              ...(this.options.kdf ? { kdf: this.options.kdf } : {}),
            })
          : await Vault.create(this.options.vaultDir, passphrase, {
              engine: this.options.engine ?? "sqlcipher",
              ...(this.options.kdf ? { kdf: this.options.kdf } : {}),
            });
      }
    } catch (error) {
      if (error instanceof SessionError) throw error;
      return json(response, 401, { error: "unlock_failed" });
    }

    const session = this.createSession(address);
    this.lastSessionEndedAt = 0;
    return json(
      response,
      200,
      {
        csrfToken: session.csrf,
        vault: {
          vaultId: this.vaultValue.header.vaultId,
          engine: this.vaultValue.engine,
        },
      },
      { "set-cookie": this.cookieHeader(session.id) },
    );
  }

  private async handleLock(
    context: RouteContext,
    response: import("node:http").ServerResponse,
  ) {
    const scope = context.body["scope"] === "all" ? "all" : "current";
    if (scope === "all") {
      this.sessions.clear();
      if (this.vaultValue?.isUnlocked) await this.vaultValue.lock();
      this.lastSessionEndedAt = Date.now();
      return json(response, 200, { locked: "all", sessions: 0 });
    }
    if (context.session) this.sessions.delete(context.session.id);
    if (this.sessions.size === 0) this.lastSessionEndedAt = Date.now();
    return json(response, 200, { locked: "current", sessions: this.sessions.size });
  }

  private createSession(address: string): Session {
    const session: Session = {
      id: newId(),
      csrf: randomBytes(32).toString("base64url"),
      address,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  private sessionFrom(request: IncomingMessage): Session | null {
    const cookies = parseCookies(request.headers.cookie ?? "");
    const id = cookies.get(COOKIE_NAME);
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    const now = Date.now();
    if (
      now - session.lastSeenAt > this.options.sessionIdleMs ||
      now - session.createdAt > this.options.sessionAbsoluteMs
    ) {
      this.sessions.delete(session.id);
      return null;
    }
    return session;
  }

  private csrfValid(request: IncomingMessage, session: Session): boolean {
    const header = request.headers["x-flowly-csrf"];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) return false;
    const expected = Buffer.from(session.csrf, "utf8");
    const provided = Buffer.from(token, "utf8");
    return expected.byteLength === provided.byteLength && timingSafeEqual(expected, provided);
  }

  private originAllowed(request: IncomingMessage): boolean {
    const origin = request.headers.origin;
    if (!origin) return true;
    const allowed = this.options.allowedOrigins ?? [this.origin];
    return allowed.includes(origin);
  }

  private consumeUnlockAttempt(address: string): boolean {
    const now = Date.now();
    const recent = (this.unlockAttempts.get(address) ?? []).filter(
      (timestamp) => now - timestamp < 60_000,
    );
    if (recent.length >= this.options.unlockAttemptsPerMinute) {
      this.unlockAttempts.set(address, recent);
      return false;
    }
    recent.push(now);
    this.unlockAttempts.set(address, recent);
    return true;
  }

  private requireVault(): Vault {
    if (!this.vaultValue?.isUnlocked) {
      throw new SessionError("vault is locked");
    }
    return this.vaultValue;
  }

  private cookieHeader(sessionId: string): string {
    const attributes = [
      `${COOKIE_NAME}=${sessionId}`,
      "HttpOnly",
      "SameSite=Strict",
      "Path=/",
      `Max-Age=${Math.floor(this.options.sessionAbsoluteMs / 1000)}`,
    ];
    if (this.options.tls) attributes.push("Secure");
    return attributes.join("; ");
  }

  private async sweep(): Promise<void> {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (
        now - session.lastSeenAt > this.options.sessionIdleMs ||
        now - session.createdAt > this.options.sessionAbsoluteMs
      ) {
        this.sessions.delete(id);
      }
    }
    if (this.sessions.size === 0) {
      if (this.lastSessionEndedAt === 0) this.lastSessionEndedAt = now;
      if (now - this.lastSessionEndedAt >= this.options.autoLockIdleMs && this.vaultValue?.isUnlocked) {
        await this.vaultValue.lock();
      }
    } else {
      this.lastSessionEndedAt = 0;
    }
  }
}

function parseCookies(header: string): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) cookies.set(name, rest.join("="));
  }
  return cookies;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.method === "GET" || request.method === "HEAD") return {};
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    bytes += buffer.byteLength;
    if (bytes > MAX_BODY_BYTES) throw new SessionError("request body too large");
    chunks.push(buffer);
  }
  if (bytes === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function json(
  response: import("node:http").ServerResponse,
  status: number,
  payload: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(payload));
}
