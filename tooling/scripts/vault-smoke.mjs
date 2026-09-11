#!/usr/bin/env node
/**
 * End-to-end vault smoke test against a running Flowly server.
 *
 *   node tooling/scripts/vault-smoke.mjs <create|verify> [baseUrl]
 *
 * `create` builds a vault and writes one account; `verify` asserts the server
 * came back locked after a restart and then unlocks, reads and cleans up.
 */
const mode = process.argv[2] ?? "verify";
const baseUrl = process.argv[3] ?? "http://127.0.0.1:8787";
const passphrase = process.env.FLOWLY_SMOKE_PASSPHRASE ?? "smoke test passphrase";
const ACCOUNT_ID = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.csrf ? { "x-flowly-csrf": options.csrf } : {}),
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return {
    status: response.status,
    body,
    cookie: (response.headers.get("set-cookie") ?? "").split(";")[0],
  };
}

async function session() {
  const created = await call("/api/vault/create", {
    method: "POST",
    body: JSON.stringify({ passphrase }),
  });
  if (created.status === 201) {
    return { cookie: created.cookie, csrf: created.body.csrfToken, created: true };
  }
  if (created.status !== 409)
    fail(`create returned ${created.status}: ${JSON.stringify(created.body)}`);
  const unlocked = await call("/api/vault/unlock", {
    method: "POST",
    body: JSON.stringify({ passphrase }),
  });
  if (unlocked.status !== 200) {
    fail(`unlock returned ${unlocked.status}: ${JSON.stringify(unlocked.body)}`);
  }
  return { cookie: unlocked.cookie, csrf: unlocked.body.csrfToken, created: false };
}

const status = await call("/api/vault/status");
if (mode === "verify" && status.body.state !== "locked") {
  fail(`expected a locked vault on a fresh start, got ${JSON.stringify(status.body)}`);
}

const { cookie, csrf, created } = await session();

const account = {
  formatVersion: 1,
  revision: 1,
  id: ACCOUNT_ID,
  name: "Smoke Testing Corp",
  type: "checking",
  defaultCurrency: "EUR",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

if (created) {
  const written = await call("/api/accounts", {
    method: "POST",
    cookie,
    csrf,
    body: JSON.stringify({ entity: account }),
  });
  if (written.status !== 201) fail(`account create returned ${written.status}`);
} else {
  const listed = await call("/api/accounts", { cookie, csrf });
  if (listed.status !== 200 || listed.body.items?.length !== 1) {
    fail(`expected one stored account, got ${JSON.stringify(listed.body)}`);
  }
}

const locked = await call("/api/vault/lock", {
  method: "POST",
  cookie,
  csrf,
  body: JSON.stringify({ scope: "all" }),
});
if (locked.status !== 200) fail(`lock returned ${locked.status}`);
const afterLock = await call("/api/vault/status");
if (afterLock.body.state !== "locked") fail("the vault did not lock");

console.log(
  JSON.stringify({
    mode,
    created,
    engine: status.body.storageEngine,
    stateBefore: status.body.state,
    stateAfter: afterLock.body.state,
  }),
);
