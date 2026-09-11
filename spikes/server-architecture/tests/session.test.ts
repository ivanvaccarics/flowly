import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";
import test, { afterEach } from "node:test";
import { SessionServer } from "../src/http/session-server.ts";
import { cleanup, sampleTransaction, tempDir, TEST_KDF } from "./helpers/test-utils.ts";

const PASSPHRASE = "correct horse battery staple";

const running: SessionServer[] = [];

interface Client {
  cookie: string;
  csrf: string;
}

async function start(options: Parameters<typeof SessionServer.start>[0]): Promise<SessionServer> {
  const server = await SessionServer.start(options);
  running.push(server);
  return server;
}

async function stopAll(): Promise<void> {
  while (running.length > 0) {
    const server = running.pop();
    if (server) await server.stop().catch(() => undefined);
  }
}

afterEach(stopAll);

async function unlock(
  origin: string,
  passphrase: string,
  options: { create?: boolean } = {},
): Promise<{ status: number; client: Client }> {
  const response = await fetch(`${origin}/api/unlock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passphrase, create: options.create ?? false }),
  });
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const body = (await response.json()) as { csrfToken?: string };
  return { status: response.status, client: { cookie, csrf: body.csrfToken ?? "" } };
}

function api(origin: string, client: Client, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${origin}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie: client.cookie,
      ...(init.method && init.method !== "GET" ? { "x-flowly-csrf": client.csrf } : {}),
      ...(init.headers ?? {}),
    },
  });
}

test("unlock requires the passphrase and rate-limits guessing", async () => {
  const dir = tempDir();
  const server = await start({
    vaultDir: dir,
    kdf: TEST_KDF,
    unlockAttemptsPerMinute: 3,
  });
  try {
    const first = await unlock(server.origin, PASSPHRASE, { create: true });
    assert.equal(first.status, 200);
    assert.ok(first.client.cookie.startsWith("flowly_sid="));
    assert.ok(first.client.csrf.length > 20);

    const locked = await api(server.origin, first.client, "/api/lock", {
      method: "POST",
      body: JSON.stringify({ scope: "all" }),
    });
    assert.equal(locked.status, 200);

    assert.equal((await unlock(server.origin, "guess one")).status, 401);
    assert.equal((await unlock(server.origin, "guess two")).status, 401);
    assert.equal((await unlock(server.origin, "guess three")).status, 429);
  } finally {
    await stopAll();
    cleanup(dir);
  }
});

test("unknown vault and wrong passphrase stay explicit", async () => {
  const dir = tempDir();
  const server = await start({
    vaultDir: join(dir, "vault"),
    kdf: TEST_KDF,
    unlockAttemptsPerMinute: 5,
  });
  try {
    const missing = await unlock(server.origin, PASSPHRASE);
    assert.equal(missing.status, 404);
    assert.equal(existsSync(join(dir, "vault")), false);

    const created = await unlock(server.origin, PASSPHRASE, { create: true });
    assert.equal(created.status, 200);
    await api(server.origin, created.client, "/api/lock", {
      method: "POST",
      body: JSON.stringify({ scope: "all" }),
    });
    const wrong = await unlock(server.origin, "not the passphrase");
    assert.equal(wrong.status, 401);
  } finally {
    await stopAll();
    cleanup(dir);
  }
});

test("sessions gate the vault API and require CSRF for writes", async () => {
  const dir = tempDir();
  const server = await start({ vaultDir: dir, kdf: TEST_KDF });
  try {
    assert.equal((await fetch(`${server.origin}/api/transactions`)).status, 401);

    const { client } = await unlock(server.origin, PASSPHRASE, { create: true });
    const transaction = sampleTransaction();

    const withoutCsrf = await fetch(`${server.origin}/api/transactions`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: client.cookie },
      body: JSON.stringify({ transaction }),
    });
    assert.equal(withoutCsrf.status, 403);

    const badOrigin = await api(server.origin, client, "/api/transactions", {
      method: "POST",
      headers: { origin: "http://evil.example" },
      body: JSON.stringify({ transaction }),
    });
    assert.equal(badOrigin.status, 403);

    const created = await api(server.origin, client, "/api/transactions", {
      method: "POST",
      body: JSON.stringify({ transaction }),
    });
    assert.equal(created.status, 201);

    const list = await api(server.origin, client, "/api/transactions");
    assert.equal(list.status, 200);
    const payload = (await list.json()) as { transactions: unknown[] };
    assert.equal(payload.transactions.length, 1);
  } finally {
    await stopAll();
    cleanup(dir);
  }
});

test("lock current keeps the vault open, lock all revokes every session", async () => {
  const dir = tempDir();
  const server = await start({ vaultDir: dir, kdf: TEST_KDF });
  try {
    const a = (await unlock(server.origin, PASSPHRASE, { create: true })).client;
    const b = (await unlock(server.origin, PASSPHRASE)).client;

    const locked = await api(server.origin, a, "/api/lock", {
      method: "POST",
      body: JSON.stringify({ scope: "current" }),
    });
    assert.equal(locked.status, 200);
    assert.equal((await api(server.origin, a, "/api/transactions")).status, 401);
    assert.equal((await api(server.origin, b, "/api/transactions")).status, 200);

    const health = (await (await fetch(`${server.origin}/api/health`)).json()) as {
      unlocked: boolean;
      sessions: number;
    };
    assert.equal(health.unlocked, true);
    assert.equal(health.sessions, 1);

    await api(server.origin, b, "/api/lock", { method: "POST", body: JSON.stringify({ scope: "all" }) });
    assert.equal((await api(server.origin, b, "/api/transactions")).status, 401);
    const afterAll = (await (await fetch(`${server.origin}/api/health`)).json()) as {
      unlocked: boolean;
      sessions: number;
    };
    assert.equal(afterAll.unlocked, false);
    assert.equal(afterAll.sessions, 0);
  } finally {
    await stopAll();
    cleanup(dir);
  }
});

test("idle sessions expire and the vault auto-locks with no session", async () => {
  const dir = tempDir();
  const server = await start({
    vaultDir: dir,
    kdf: TEST_KDF,
    sessionIdleMs: 80,
    autoLockIdleMs: 100,
  });
  try {
    const { client } = await unlock(server.origin, PASSPHRASE, { create: true });
    assert.equal((await api(server.origin, client, "/api/transactions")).status, 200);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const health = (await (await fetch(`${server.origin}/api/health`)).json()) as {
      unlocked: boolean;
      sessions: number;
    };
    assert.equal(health.sessions, 0, "idle session must be swept");
    assert.equal(health.unlocked, false, "vault must auto-lock with no active session");
    assert.equal((await api(server.origin, client, "/api/transactions")).status, 401);
  } finally {
    await stopAll();
    cleanup(dir);
  }
});

test("private-network HTTPS works with a self-signed certificate", async (context) => {
  const dir = tempDir();
  const keyPath = join(dir, "server.key");
  const certPath = join(dir, "server.crt");
  try {
    execFileSync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=flowly.local",
      "-addext",
      "subjectAltName=DNS:flowly.local,IP:127.0.0.1",
    ]);
  } catch {
    context.skip("openssl is not available to generate a test certificate");
    cleanup(dir);
    return;
  }

  const server = await start({
    vaultDir: dir,
    host: "127.0.0.1",
    kdf: TEST_KDF,
    tls: { key: readFileSync(keyPath), cert: readFileSync(certPath) },
  });
  try {
    assert.ok(server.origin.startsWith("https://"));
    const body = await new Promise<string>((resolve, reject) => {
      const request = httpsRequest(
        `${server.origin}/api/health`,
        { rejectUnauthorized: false },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        },
      );
      request.on("error", reject);
      request.end();
    });
    const health = JSON.parse(body) as { status: string };
    assert.equal(health.status, "ok");
  } finally {
    await stopAll();
    cleanup(dir);
  }
});
