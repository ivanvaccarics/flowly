import Fastify, { type FastifyInstance } from "fastify";
import { schemaIndex, validateContract, type VaultStatus } from "@flowly/web-contracts";
import type { ServerConfig } from "../config.js";
import { EXPORT_FORMAT_VERSION, SERVER_VERSION, VAULT_FORMAT_VERSION } from "../version.js";

export interface BuildAppOptions {
  config: ServerConfig;
  /** Phase 2 replaces this with the real vault. Until then the vault is locked. */
  vaultStatus?: () => VaultStatus;
  startedAt?: number;
}

export function defaultLockedStatus(engine: ServerConfig["storageEngine"]): VaultStatus {
  return {
    state: "locked",
    vaultFormatVersion: VAULT_FORMAT_VERSION,
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    storageEngine: engine,
    schemaVersion: null,
    lastUnlockedAt: null,
  };
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const { config } = options;
  const startedAt = options.startedAt ?? Date.now();
  const app = Fastify({
    logger: config.logLevel === "silent" ? false : { level: config.logLevel },
  });

  app.get("/api/health", async () => ({
    status: "ok",
    version: SERVER_VERSION,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  }));

  app.get("/api/vault/status", async (_request, reply) => {
    const status = options.vaultStatus?.() ?? defaultLockedStatus(config.storageEngine);
    const validation = validateContract("vaultStatus", status);
    if (!validation.valid) {
      reply.code(500);
      return { error: "contract_violation", details: validation.errors };
    }
    return status;
  });

  app.post("/api/vault/unlock", async (_request, reply) => {
    reply.code(501);
    return { error: "not_implemented", feature: "vault unlock", phase: "Phase 2" };
  });

  app.get("/api/contracts", async () => ({
    vaultFormatVersion: VAULT_FORMAT_VERSION,
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    schemas: schemaIndex,
  }));

  app.setNotFoundHandler(async (_request, reply) => {
    reply.code(404);
    return { error: "not_found" };
  });

  return app;
}
