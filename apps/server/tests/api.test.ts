import { validateContract } from "@flowly/web-contracts";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/api/app.js";
import { loadConfig } from "../src/config.js";

const config = loadConfig({
  NODE_ENV: "test",
  FLOWLY_HOST: "127.0.0.1",
  FLOWLY_PORT: "8787",
  FLOWLY_VAULT_DIR: "./data/vault",
  FLOWLY_STORAGE_ENGINE: "sqlcipher",
  FLOWLY_LOG_LEVEL: "silent",
  FLOWLY_ALLOWED_ORIGIN: "http://127.0.0.1:5173",
});

describe("server API", () => {
  it("reports health without touching the vault", async () => {
    const app = buildApp({ config });
    const response = await app.inject({ method: "GET", url: "/api/health" });
    expect(response.statusCode).toBe(200);
    const payload = response.json<{ status: string; version: string }>();
    expect(payload.status).toBe("ok");
    expect(payload.version).toMatch(/^\d+\.\d+\.\d+$/);
    await app.close();
  });

  it("serves a contract-valid locked vault status", async () => {
    const app = buildApp({ config });
    const response = await app.inject({ method: "GET", url: "/api/vault/status" });
    expect(response.statusCode).toBe(200);
    const payload = response.json<unknown>();
    expect(validateContract("vaultStatus", payload)).toEqual({ valid: true });
    expect(response.json<{ state: string }>().state).toBe("locked");
    expect(response.json<{ storageEngine: string }>().storageEngine).toBe("sqlcipher");
    await app.close();
  });

  it("fails loudly when a status provider violates the contract", async () => {
    const app = buildApp({
      config,
      vaultStatus: () => ({ state: "sideways" }) as never,
    });
    const response = await app.inject({ method: "GET", url: "/api/vault/status" });
    expect(response.statusCode).toBe(500);
    expect(response.json<{ error: string }>().error).toBe("contract_violation");
    await app.close();
  });

  it("keeps unlock unimplemented until Phase 2", async () => {
    const app = buildApp({ config });
    const response = await app.inject({ method: "POST", url: "/api/vault/unlock" });
    expect(response.statusCode).toBe(501);
    expect(response.json<{ phase: string }>().phase).toBe("Phase 2");
    await app.close();
  });

  it("exposes the contract index and a 404 handler", async () => {
    const app = buildApp({ config });
    const contracts = await app.inject({ method: "GET", url: "/api/contracts" });
    expect(contracts.statusCode).toBe(200);
    expect(contracts.json<{ schemas: unknown[] }>().schemas.length).toBeGreaterThan(5);

    const missing = await app.inject({ method: "GET", url: "/api/nope" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json<{ error: string }>().error).toBe("not_found");
    await app.close();
  });
});
