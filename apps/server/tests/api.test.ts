import { existsSync } from "node:fs";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { appState, buildApp } from "../src/api/app.js";
import { loadConfig, type ServerConfig } from "../src/config.js";
import { createAccount, type Account } from "../src/domain/account.js";
import { cleanup, tempDir, TEST_KDF } from "./helpers/test-utils.js";

const PASSPHRASE = "correct horse battery staple";
const ACCOUNT_ID = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
const NOW = "2026-09-01T08:00:00.000Z";

interface Client {
  cookie: string;
  csrf: string;
}

const openApps: FastifyInstance[] = [];
const openDirs: string[] = [];

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const dir = tempDir("flowly-api-");
  openDirs.push(dir);
  const base = loadConfig({
    NODE_ENV: "test",
    FLOWLY_HOST: "127.0.0.1",
    FLOWLY_PORT: "8787",
    FLOWLY_VAULT_DIR: dir,
    FLOWLY_STORAGE_ENGINE: "sqlcipher",
    FLOWLY_LOG_LEVEL: "silent",
    FLOWLY_ALLOWED_ORIGIN: "http://127.0.0.1:5173",
    FLOWLY_SESSION_IDLE_MINUTES: "15",
    FLOWLY_AUTO_LOCK_MINUTES: "5",
  });
  return { ...base, ...overrides };
}

function startApp(config: ServerConfig): FastifyInstance {
  const app = buildApp({ config });
  openApps.push(app);
  return app;
}

async function createVault(app: FastifyInstance, passphrase = PASSPHRASE): Promise<Client> {
  const response = await app.inject({
    method: "POST",
    url: "/api/vault/create",
    payload: { passphrase },
  });
  expect(response.statusCode).toBe(201);
  return clientFrom(
    response.headers["set-cookie"] as string,
    response.json<{ csrfToken: string }>(),
  );
}

async function unlock(
  app: FastifyInstance,
  passphrase = PASSPHRASE,
): Promise<{ statusCode: number; client?: Client; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/vault/unlock",
    payload: { passphrase },
  });
  const body = response.json<Record<string, unknown>>();
  if (response.statusCode !== 200) return { statusCode: response.statusCode, body };
  return {
    statusCode: response.statusCode,
    client: clientFrom(response.headers["set-cookie"] as string, body),
    body,
  };
}

function clientFrom(setCookie: string, body: Record<string, unknown>): Client {
  return {
    cookie: (setCookie ?? "").split(";")[0] ?? "",
    csrf: String(body["csrfToken"] ?? ""),
  };
}

function authed(
  app: FastifyInstance,
  client: Client,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    url: string;
    payload?: unknown;
    csrf?: boolean;
    origin?: string;
  },
): Promise<LightMyRequestResponse> {
  const headers: Record<string, string> = { cookie: client.cookie };
  if (options.csrf !== false && options.method !== "GET") {
    headers["x-flowly-csrf"] = client.csrf;
  }
  if (options.origin) headers["origin"] = options.origin;
  const request: InjectOptions = {
    method: options.method,
    url: options.url,
    headers,
  };
  if (options.payload !== undefined) {
    request.payload = options.payload as NonNullable<InjectOptions["payload"]>;
  }
  return app.inject(request);
}

function sampleAccount(overrides: Partial<Account> = {}): Account {
  return {
    ...createAccount(
      { name: "Everyday", type: "checking", defaultCurrency: "EUR" },
      { id: ACCOUNT_ID, now: NOW },
    ),
    ...overrides,
  };
}

afterEach(async () => {
  while (openApps.length > 0) {
    const app = openApps.pop();
    if (app) await app.close().catch(() => undefined);
  }
  while (openDirs.length > 0) {
    const dir = openDirs.pop();
    if (dir) cleanup(dir);
  }
});

describe("vault API", () => {
  it("counts unlock attempts against the real client, not a forged header", async () => {
    const app = startApp(makeConfig({ trustProxy: true, unlockAttemptsPerMinute: 3 }));
    await createVault(app);

    const statuses: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/vault/unlock",
        // What Caddy forwards: whatever the client wrote, then the address it
        // really saw. Only the second entry can be trusted.
        headers: { "x-forwarded-for": `1.2.3.${index}, 203.0.113.9` },
        remoteAddress: "172.18.0.3",
        payload: { passphrase: "wrong passphrase" },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it("keeps financial responses out of any cache", async () => {
    const app = startApp(makeConfig());
    const client = await createVault(app);
    const status = await authed(app, client, { method: "GET", url: "/api/vault/status" });
    expect(status.headers["cache-control"]).toBe("no-store");
  });

  it("creates a vault, opens a session and reports an unlocked status", async () => {
    const app = startApp(makeConfig());
    const client = await createVault(app);
    expect(client.cookie.startsWith("flowly_sid=")).toBe(true);
    expect(client.csrf.length).toBeGreaterThan(20);

    const status = await app.inject({ method: "GET", url: "/api/vault/status" });
    expect(status.statusCode).toBe(200);
    const body = status.json<{ state: string; schemaVersion: number; storageEngine: string }>();
    expect(body.state).toBe("unlocked");
    expect(body.schemaVersion).toBe(5);
    expect(body.storageEngine).toBe("sqlcipher");
  });

  it("resumes an open vault from the session cookie alone", async () => {
    const app = startApp(makeConfig());
    const client = await createVault(app);

    // Exactly what a browser does after a reload: no passphrase, only the
    // cookie the session was created with.
    const resumed = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: client.cookie },
    });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json<{ csrfToken: string }>().csrfToken).toBe(client.csrf);
    expect(resumed.json<{ vault: { state: string } }>().vault.state).toBe("unlocked");

    const anonymous = await app.inject({ method: "GET", url: "/api/session" });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json<{ error: string }>().error).toBe("session_required");
  });

  it("creates the vault with fast parameters in tests and refuses duplicates", async () => {
    const config = makeConfig();
    const app = startApp(config);
    const vault = await (
      await import("../src/vault/vault.js")
    ).Vault.create(config.vaultDir, PASSPHRASE, { kdf: TEST_KDF });
    await vault.lock();
    const response = await app.inject({
      method: "POST",
      url: "/api/vault/create",
      payload: { passphrase: PASSPHRASE },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toBe("vault_exists");
  });

  it("rejects a wrong passphrase and reports a missing vault", async () => {
    const app = startApp(makeConfig());
    expect((await unlock(app)).statusCode).toBe(404);

    const created = await createVault(app);
    await authed(app, created, {
      method: "POST",
      url: "/api/vault/lock",
      payload: { scope: "all" },
    });

    const wrong = await unlock(app, "not the passphrase");
    expect(wrong.statusCode).toBe(401);
    expect(wrong.body["error"]).toBe("invalid_passphrase");
  });

  it("rate-limits repeated unlock attempts", async () => {
    const config = makeConfig({ unlockAttemptsPerMinute: 2 });
    const app = startApp(config);
    const created = await createVault(app);
    await authed(app, created, {
      method: "POST",
      url: "/api/vault/lock",
      payload: { scope: "all" },
    });

    expect((await unlock(app, "wrong one")).statusCode).toBe(401);
    expect((await unlock(app, "wrong two")).statusCode).toBe(429);
  });

  it("requires a session, a CSRF token and a trusted origin", async () => {
    const app = startApp(makeConfig());
    expect((await app.inject({ method: "GET", url: "/api/accounts" })).statusCode).toBe(401);

    const client = await createVault(app);
    expect((await authed(app, client, { method: "GET", url: "/api/accounts" })).statusCode).toBe(
      200,
    );
    expect(
      (
        await authed(app, client, {
          method: "POST",
          url: "/api/accounts",
          payload: { entity: sampleAccount() },
          csrf: false,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await authed(app, client, {
          method: "POST",
          url: "/api/accounts",
          payload: { entity: sampleAccount() },
          origin: "http://evil.example",
        })
      ).statusCode,
    ).toBe(403);
  });

  it("enforces optimistic concurrency instead of overwriting", async () => {
    const app = startApp(makeConfig());
    const client = await createVault(app);

    const created = await authed(app, client, {
      method: "POST",
      url: "/api/accounts",
      payload: { entity: sampleAccount() },
    });
    expect(created.statusCode).toBe(201);
    const stored = created.json<{ entity: Account }>().entity;
    expect(stored.revision).toBe(1);

    const updated = await authed(app, client, {
      method: "PUT",
      url: `/api/accounts/${ACCOUNT_ID}`,
      payload: { entity: { ...stored, name: "Renamed" } },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<{ entity: Account }>().entity.revision).toBe(2);

    const stale = await authed(app, client, {
      method: "PUT",
      url: `/api/accounts/${ACCOUNT_ID}`,
      payload: { entity: { ...stored, name: "Stale writer" } },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json<{ error: string; actualRevision: number }>().error).toBe("revision_conflict");
    expect(stale.json<{ actualRevision: number }>().actualRevision).toBe(2);

    const wrongDelete = await authed(app, client, {
      method: "DELETE",
      url: `/api/accounts/${ACCOUNT_ID}?revision=1`,
    });
    expect(wrongDelete.statusCode).toBe(409);

    const deleted = await authed(app, client, {
      method: "DELETE",
      url: `/api/accounts/${ACCOUNT_ID}?revision=2`,
    });
    expect(deleted.statusCode).toBe(200);
    expect(
      (await authed(app, client, { method: "GET", url: `/api/accounts/${ACCOUNT_ID}` })).statusCode,
    ).toBe(404);
  });

  it("keeps other sessions open on lock-current and revokes everything on lock-all", async () => {
    const app = startApp(makeConfig());
    const first = await createVault(app);
    const second = await unlock(app);
    expect(second.statusCode).toBe(200);
    const secondClient = second.client as Client;

    await authed(app, first, {
      method: "POST",
      url: "/api/vault/lock",
      payload: { scope: "current" },
    });
    expect((await authed(app, first, { method: "GET", url: "/api/accounts" })).statusCode).toBe(
      401,
    );
    expect(
      (await authed(app, secondClient, { method: "GET", url: "/api/accounts" })).statusCode,
    ).toBe(200);

    const locked = await authed(app, secondClient, {
      method: "POST",
      url: "/api/vault/lock",
      payload: { scope: "all" },
    });
    expect(locked.statusCode).toBe(200);
    expect(appState(app).vault()?.isUnlocked).toBe(false);
    const status = await app.inject({ method: "GET", url: "/api/vault/status" });
    expect(status.json<{ state: string }>().state).toBe("locked");
    expect(
      (await authed(app, secondClient, { method: "GET", url: "/api/accounts" })).statusCode,
    ).toBe(401);
  });

  it("answers 423 when a valid session meets a locked vault", async () => {
    const app = startApp(makeConfig());
    const client = await createVault(app);
    await appState(app).vault()?.lock();
    const response = await authed(app, client, { method: "GET", url: "/api/accounts" });
    expect(response.statusCode).toBe(423);
    expect(response.json<{ error: string }>().error).toBe("vault_locked");
  });

  it("returns to a locked state after a restart and unlocks with the same passphrase", async () => {
    const config = makeConfig();
    const first = startApp(config);
    await createVault(first);
    await first.close();

    const restarted = startApp(config);
    const status = await restarted.inject({ method: "GET", url: "/api/vault/status" });
    expect(status.json<{ state: string }>().state).toBe("locked");

    const unlocked = await unlock(restarted);
    expect(unlocked.statusCode).toBe(200);
  });

  it("auto-locks when no session stays active", async () => {
    const app = startApp(makeConfig({ autoLockMs: 60, sessionIdleMs: 50 }));
    await createVault(app);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(appState(app).vault()?.isUnlocked).toBe(false);
    const status = await app.inject({ method: "GET", url: "/api/vault/status" });
    expect(status.json<{ state: string }>().state).toBe("locked");
  });

  it("changes the passphrase and deletes the vault with an explicit confirmation", async () => {
    const config = makeConfig();
    const app = startApp(config);
    const client = await createVault(app);

    const changed = await authed(app, client, {
      method: "POST",
      url: "/api/vault/passphrase",
      payload: { currentPassphrase: PASSPHRASE, nextPassphrase: "a brand new passphrase" },
    });
    expect(changed.statusCode).toBe(200);

    await authed(app, client, {
      method: "POST",
      url: "/api/vault/lock",
      payload: { scope: "all" },
    });
    expect((await unlock(app, PASSPHRASE)).statusCode).toBe(401);
    const unlocked = await unlock(app, "a brand new passphrase");
    expect(unlocked.statusCode).toBe(200);

    const removed = await authed(app, unlocked.client as Client, {
      method: "DELETE",
      url: "/api/vault",
      payload: { passphrase: "a brand new passphrase" },
    });
    expect(removed.statusCode).toBe(200);
    expect(existsSync(config.vaultDir)).toBe(false);
  });
});
