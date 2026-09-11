import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { VaultStatus } from "@flowly/web-contracts";
import { ImportExportService } from "../application/import-export-service.js";
import { TaggingRuleService } from "../application/tagging-rule-service.js";
import type { ServerConfig } from "../config.js";
import { VaultCorruptError, VaultKeyError } from "../crypto/errors.js";
import { DomainError } from "../domain/errors.js";
import { generateId } from "../domain/ids.js";
import { ArchiveIntegrityError, ArchivePasswordError, ImportError } from "../portability/errors.js";
import { AttemptLimiter, SessionStore, type Session } from "../session/session-store.js";
import {
  ConflictError,
  RecordExistsError,
  RecordNotFoundError,
  StorageError,
} from "../storage/errors.js";
import type { Repository, RepositoryEntity } from "../storage/repositories.js";
import { Vault, VaultExistsError, VaultLockedError, VaultNotFoundError } from "../vault/vault.js";
import { AccountInUseError, AccountNotFoundError, TagInUseError } from "../vault/vault.js";
import { EXPORT_FORMAT_VERSION, SERVER_VERSION, VAULT_FORMAT_VERSION } from "../version.js";

const COOKIE_NAME = "flowly_sid";

export interface AppState {
  vault(): Vault | null;
  sessions: SessionStore;
  limiter: AttemptLimiter;
}

export interface BuildAppOptions {
  config: ServerConfig;
  /** Pre-opened vault, used by tests; normally the app opens it on unlock. */
  vault?: Vault | null;
  startedAt?: number;
}

interface RequestContext {
  session: Session;
  vault: Vault;
}

type ContextGuard = (request: FastifyRequest, reply: FastifyReply) => RequestContext | undefined;

export function appState(app: FastifyInstance): AppState {
  return (app as unknown as { flowlyState: AppState }).flowlyState;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config } = options;
  const startedAt = options.startedAt ?? Date.now();
  let vault: Vault | null = options.vault ?? null;
  const sessions = new SessionStore({
    idleMs: config.sessionIdleMs,
    absoluteMs: config.sessionAbsoluteMs,
  });
  const limiter = new AttemptLimiter(config.unlockAttemptsPerMinute);
  let lastSessionEndedAt = 0;

  const app = Fastify({
    logger: config.logLevel === "silent" ? false : { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 32 * 1024 * 1024,
  });

  const state: AppState = { vault: () => vault, sessions, limiter };
  app.decorate("flowlyState", state);

  const requireSession = (request: FastifyRequest, reply: FastifyReply): Session | undefined => {
    const session = sessions.touch(readCookie(request, COOKIE_NAME) ?? "");
    if (!session) {
      reply.code(401);
      return undefined;
    }
    return session;
  };

  const requireContext: ContextGuard = (request, reply) => {
    if (!originAllowed(request, config)) {
      reply.code(403);
      return undefined;
    }
    const session = requireSession(request, reply);
    if (!session) return undefined;
    if (isMutating(request) && !csrfMatches(request, session)) {
      reply.code(403);
      return undefined;
    }
    if (!vault?.isUnlocked) {
      reply.code(423);
      return undefined;
    }
    return { session, vault };
  };

  app.get("/api/health", async () => ({
    status: "ok",
    version: SERVER_VERSION,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  }));

  app.get("/api/vault/status", async (): Promise<VaultStatus> => {
    if (!vault) return lockedStatus(config.storageEngine);
    return vault.status();
  });

  app.post("/api/vault/create", async (request, reply) => {
    if (!originAllowed(request, config)) {
      reply.code(403);
      return { error: "origin_not_allowed" };
    }
    if (!limiter.consume(clientAddress(request))) {
      reply.code(429);
      return { error: "too_many_attempts" };
    }
    const passphrase = passphraseFrom(request.body);
    if (!passphrase) {
      reply.code(400);
      return { error: "passphrase_required" };
    }
    const created = await Vault.create(config.vaultDir, passphrase, {
      engine: config.storageEngine,
    });
    vault = created;
    const session = sessions.create(clientAddress(request));
    lastSessionEndedAt = 0;
    reply.code(201);
    reply.header("set-cookie", cookie(session, config, request));
    return { csrfToken: session.csrf, vault: await created.status() };
  });

  app.post("/api/vault/unlock", async (request, reply) => {
    if (!originAllowed(request, config)) {
      reply.code(403);
      return { error: "origin_not_allowed" };
    }
    const address = clientAddress(request);
    if (!limiter.consume(address)) {
      reply.code(429);
      return { error: "too_many_attempts", retryAfterMs: 60_000 };
    }
    if (!Vault.exists(config.vaultDir)) {
      reply.code(404);
      return { error: "vault_not_found" };
    }
    const passphrase = passphraseFrom(request.body);
    if (!passphrase) {
      reply.code(400);
      return { error: "passphrase_required" };
    }
    const opened = await Vault.open(config.vaultDir, passphrase, {
      engine: config.storageEngine,
    });
    vault = opened;
    limiter.reset(address);
    const session = sessions.create(address);
    lastSessionEndedAt = 0;
    reply.header("set-cookie", cookie(session, config, request));
    return { csrfToken: session.csrf, vault: await opened.status() };
  });

  app.post("/api/vault/lock", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body["scope"] === "all") {
      sessions.clear();
      await context.vault.lock();
      lastSessionEndedAt = Date.now();
      return { locked: "all", sessions: 0 };
    }
    sessions.delete(context.session.id);
    if (sessions.size === 0) lastSessionEndedAt = Date.now();
    return { locked: "current", sessions: sessions.size };
  });

  app.post("/api/vault/passphrase", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const current = body["currentPassphrase"];
    const next = body["nextPassphrase"];
    if (typeof current !== "string" || typeof next !== "string" || next.length === 0) {
      reply.code(400);
      return { error: "passphrases_required" };
    }
    await context.vault.changePassphrase(current, next);
    return { changed: true };
  });

  app.delete("/api/vault", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const passphrase = (request.body as { passphrase?: unknown } | null)?.["passphrase"];
    if (typeof passphrase !== "string") {
      reply.code(400);
      return { error: "passphrase_required" };
    }
    const proof = await Vault.open(config.vaultDir, passphrase);
    await proof.lock();
    await context.vault.lock();
    await Vault.destroy(config.vaultDir);
    sessions.clear();
    vault = null;
    lastSessionEndedAt = 0;
    return { deleted: true };
  });

  app.get("/api/session", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return { error: "session_required" };
    return {
      csrfToken: session.csrf,
      vault: vault ? await vault.status() : lockedStatus(config.storageEngine),
    };
  });

  registerCollection(
    app,
    "/api/accounts",
    requireContext,
    (context) => context.vault.accounts,
    undefined,
    (context, id, revision, cascade) => context.vault.deleteAccount(id, revision, { cascade }),
  );
  registerCollection(
    app,
    "/api/transactions",
    requireContext,
    (context) => context.vault.transactions,
    async (transaction, context) => {
      const taggingRules = new TaggingRuleService(context.vault);
      const rules = await taggingRules.rules();
      return taggingRules.withRuleTags(transaction, rules).transaction;
    },
  );
  registerCollection(
    app,
    "/api/tags",
    requireContext,
    (context) => context.vault.tags,
    undefined,
    (context, id, revision, cascade) => context.vault.deleteTag(id, revision, { cascade }),
  );
  registerCollection(
    app,
    "/api/tagging-rules",
    requireContext,
    (context) => context.vault.taggingRules,
  );

  // --- destructive operations, cascades and tagging backfill -----------------

  app.post("/api/accounts/:id/archive", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const { id } = request.params as { id: string };
    const revision = revisionFrom(request.body);
    if (!revision) {
      reply.code(400);
      return { error: "revision_required" };
    }
    return { entity: await context.vault.archiveAccount(id, revision) };
  });

  app.delete("/api/accounts/:id/cascade", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const { id } = request.params as { id: string };
    const revision = Number((request.query as Record<string, unknown>)["revision"]);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      reply.code(400);
      return { error: "revision_required" };
    }
    const result = await context.vault.deleteAccount(id, revision, { cascade: true });
    return { deleted: true, ...result };
  });

  app.delete("/api/tags/:id/cascade", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const { id } = request.params as { id: string };
    const revision = Number((request.query as Record<string, unknown>)["revision"]);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      reply.code(400);
      return { error: "revision_required" };
    }
    const result = await context.vault.deleteTag(id, revision, { cascade: true });
    return { deleted: true, ...result };
  });

  app.post("/api/tagging-rules/backfill", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const scope: { accountId?: string; fromDate?: string; toDate?: string } = {};
    if (typeof body["accountId"] === "string") scope.accountId = body["accountId"];
    if (typeof body["fromDate"] === "string") scope.fromDate = body["fromDate"];
    if (typeof body["toDate"] === "string") scope.toDate = body["toDate"];
    return new TaggingRuleService(context.vault).backfill(scope);
  });

  // --- export ---------------------------------------------------------------

  app.get("/api/export/transactions.csv", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const csv = await importExport(context).exportTransactionsCsv();
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="flowly-transactions.csv"');
    return csv;
  });

  app.post("/api/export/archive", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const password = (request.body as { password?: unknown } | null)?.["password"];
    if (typeof password !== "string" || password.length < 8) {
      reply.code(400);
      return { error: "archive_password_too_short" };
    }
    const dir = mkdtempSync(join(tmpdir(), "flowly-export-"));
    const destination = join(dir, "vault.flowly");
    try {
      const result = await importExport(context).exportArchive(destination, password);
      const content = readFileSync(destination);
      reply.header("content-type", "application/octet-stream");
      reply.header("content-disposition", 'attachment; filename="flowly-vault.flowly"');
      reply.header("x-flowly-manifest-entries", String(result.manifest.entries.length));
      return reply.send(content);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // --- import ---------------------------------------------------------------

  app.post("/api/import/csv/preview", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const content = csvContent(request.body);
    if (content === undefined) {
      reply.code(400);
      return { error: "csv_content_required" };
    }
    return importExport(context).previewTransactionCsv(content);
  });

  app.post("/api/import/csv", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const content = csvContent(request.body);
    if (content === undefined) {
      reply.code(400);
      return { error: "csv_content_required" };
    }
    return importExport(context).importTransactionCsv(content);
  });

  app.post("/api/import/archive", async (request, reply) => {
    const context = requireContext(request, reply);
    if (!context) return errorBody(reply);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const password = body["password"];
    const contentBase64 = body["contentBase64"];
    if (typeof password !== "string" || password.length === 0) {
      reply.code(400);
      return { error: "archive_password_required" };
    }
    if (typeof contentBase64 !== "string" || contentBase64.length === 0) {
      reply.code(400);
      return { error: "archive_content_required" };
    }
    const dir = mkdtempSync(join(tmpdir(), "flowly-import-"));
    const source = join(dir, "vault.flowly");
    try {
      writeFileSync(source, Buffer.from(contentBase64, "base64"), { mode: 0o600 });
      return await importExport(context).importArchive(source, password);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  app.setNotFoundHandler(async (_request, reply) => {
    reply.code(404);
    return { error: "not_found" };
  });

  app.setErrorHandler(async (error, _request, reply) => {
    const mapped = mapError(error);
    reply.code(mapped.status);
    return mapped.body;
  });

  const sweepMs = Math.min(1000, Math.max(25, Math.floor(config.autoLockMs / 4)));
  const timer = setInterval(() => {
    sessions.sweep();
    const now = Date.now();
    if (sessions.size > 0) {
      lastSessionEndedAt = 0;
      return;
    }
    if (lastSessionEndedAt === 0) {
      lastSessionEndedAt = now;
      return;
    }
    if (vault?.isUnlocked && now - lastSessionEndedAt >= config.autoLockMs) {
      void vault.lock();
    }
  }, sweepMs);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    if (vault?.isUnlocked) await vault.lock();
  });

  return app;
}

function registerCollection<T extends RepositoryEntity>(
  instance: FastifyInstance,
  path: string,
  guard: ContextGuard,
  repositoryOf: (context: RequestContext) => Repository<T>,
  beforeCreate?: (entity: T, context: RequestContext) => Promise<T>,
  deleteEntity?: (
    context: RequestContext,
    id: string,
    revision: number,
    cascade: boolean,
  ) => Promise<unknown>,
): void {
  const resolve = (request: FastifyRequest, reply: FastifyReply) => {
    const context = guard(request, reply);
    return context ? { context, repository: repositoryOf(context) } : undefined;
  };

  instance.get(path, async (request, reply) => {
    const resolved = resolve(request, reply);
    if (!resolved) return errorBody(reply);
    return { items: await resolved.repository.list() };
  });

  instance.get(`${path}/:id`, async (request, reply) => {
    const resolved = resolve(request, reply);
    if (!resolved) return errorBody(reply);
    const { id } = request.params as { id: string };
    const entity = await resolved.repository.get(id);
    if (!entity) {
      reply.code(404);
      return { error: "not_found" };
    }
    return { entity };
  });

  instance.post(path, async (request, reply) => {
    const resolved = resolve(request, reply);
    if (!resolved) return errorBody(reply);
    const entity = entityFrom<T>(request.body);
    if (!entity) {
      reply.code(400);
      return { error: "entity_required" };
    }
    const prepared = beforeCreate ? await beforeCreate(entity, resolved.context) : entity;
    const created = await resolved.repository.create(prepared);
    reply.code(201);
    return { entity: created };
  });

  instance.put(`${path}/:id`, async (request, reply) => {
    const resolved = resolve(request, reply);
    if (!resolved) return errorBody(reply);
    const { id } = request.params as { id: string };
    const entity = entityFrom<T>(request.body);
    if (!entity || entity.id !== id) {
      reply.code(400);
      return { error: "entity_required" };
    }
    return { entity: await resolved.repository.update(entity, entity.revision) };
  });

  instance.delete(`${path}/:id`, async (request, reply) => {
    const resolved = resolve(request, reply);
    if (!resolved) return errorBody(reply);
    const { id } = request.params as { id: string };
    const query = request.query as Record<string, unknown>;
    const revision = Number(query["revision"]);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      reply.code(400);
      return { error: "revision_required" };
    }
    if (deleteEntity) {
      const cascade = query["cascade"] === "true";
      return {
        deleted: true,
        ...((await deleteEntity(resolved.context, id, revision, cascade)) ?? {}),
      };
    }
    await resolved.repository.delete(id, revision);
    return { deleted: true };
  });
}

function entityFrom<T>(body: unknown): T | undefined {
  const candidate = (body as Record<string, unknown> | null)?.["entity"];
  return candidate && typeof candidate === "object" ? (candidate as T) : undefined;
}

function revisionFrom(body: unknown): number | undefined {
  const candidate = (body as Record<string, unknown> | null)?.["revision"];
  return Number.isSafeInteger(candidate) && (candidate as number) > 0
    ? (candidate as number)
    : undefined;
}

function csvContent(body: unknown): string | undefined {
  const candidate = (body as Record<string, unknown> | null)?.["content"];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function importExport(context: RequestContext): ImportExportService {
  const taggingRules = new TaggingRuleService(context.vault);
  return new ImportExportService({
    vault: context.vault,
    taggingRules,
    newId: generateId,
  });
}

function lockedStatus(engine: ServerConfig["storageEngine"]): VaultStatus {
  return {
    state: "locked",
    vaultFormatVersion: VAULT_FORMAT_VERSION,
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    storageEngine: engine,
    schemaVersion: null,
    lastUnlockedAt: null,
  };
}

function errorBody(reply: FastifyReply): Record<string, unknown> {
  switch (reply.statusCode) {
    case 401:
      return { error: "session_required" };
    case 403:
      return { error: "forbidden" };
    case 423:
      return { error: "vault_locked" };
    default:
      return { error: "request_failed" };
  }
}

function isMutating(request: FastifyRequest): boolean {
  return request.method !== "GET" && request.method !== "HEAD";
}

function originAllowed(request: FastifyRequest, config: ServerConfig): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  return origin === config.allowedOrigin;
}

function csrfMatches(request: FastifyRequest, session: Session): boolean {
  const header = request.headers["x-flowly-csrf"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token || token.length !== session.csrf.length) return false;
  let mismatch = 0;
  for (let index = 0; index < token.length; index += 1) {
    mismatch |= token.charCodeAt(index) ^ session.csrf.charCodeAt(index);
  }
  return mismatch === 0;
}

function clientAddress(request: FastifyRequest): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

function passphraseFrom(body: unknown): string | undefined {
  const candidate = (body as Record<string, unknown> | null)?.["passphrase"];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function cookie(session: Session, config: ServerConfig, request: FastifyRequest): string {
  const attributes = [
    `${COOKIE_NAME}=${session.id}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${Math.floor(config.sessionAbsoluteMs / 1000)}`,
  ];
  if (config.trustProxy && request.protocol === "https") attributes.push("Secure");
  return attributes.join("; ");
}

function readCookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

function mapError(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof VaultLockedError) return { status: 423, body: { error: "vault_locked" } };
  if (error instanceof VaultKeyError) return { status: 401, body: { error: "invalid_passphrase" } };
  if (error instanceof VaultNotFoundError) {
    return { status: 404, body: { error: "vault_not_found" } };
  }
  if (error instanceof VaultExistsError) return { status: 409, body: { error: "vault_exists" } };
  if (error instanceof ConflictError) {
    return {
      status: 409,
      body: {
        error: "revision_conflict",
        expectedRevision: error.expectedRevision,
        actualRevision: error.actualRevision,
      },
    };
  }
  if (error instanceof RecordExistsError) {
    return { status: 409, body: { error: "already_exists", id: error.id } };
  }
  if (error instanceof RecordNotFoundError) {
    return { status: 404, body: { error: "not_found", id: error.id } };
  }
  if (error instanceof DomainError) {
    return {
      status: 400,
      body: { error: "invalid_request", code: error.code, details: error.details },
    };
  }
  if (error instanceof VaultCorruptError || error instanceof StorageError) {
    return { status: 500, body: { error: "vault_unreadable", message: error.message } };
  }
  if (error instanceof AccountNotFoundError) {
    return { status: 404, body: { error: "not_found", message: error.message } };
  }
  if (error instanceof AccountInUseError) {
    return {
      status: 409,
      body: { error: "account_in_use", transactionCount: error.transactionCount },
    };
  }
  if (error instanceof TagInUseError) {
    return {
      status: 409,
      body: {
        error: "tag_in_use",
        transactionCount: error.transactionCount,
        ruleCount: error.ruleCount,
      },
    };
  }
  if (error instanceof ArchivePasswordError) {
    return { status: 400, body: { error: "archive_password_invalid" } };
  }
  if (error instanceof ArchiveIntegrityError) {
    return { status: 400, body: { error: "archive_invalid", message: error.message } };
  }
  if (error instanceof ImportError) {
    return { status: 400, body: { error: "import_failed", message: error.message } };
  }
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const status = Number((error as { statusCode?: unknown }).statusCode);
    if (Number.isSafeInteger(status)) {
      return { status, body: { error: "request_failed" } };
    }
  }
  return { status: 500, body: { error: "internal_error" } };
}
