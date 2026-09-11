#!/usr/bin/env node
/**
 * End-to-end acceptance run for the Flowly Server MVP.
 *
 *   node tooling/scripts/acceptance.mjs [baseUrl]
 *   FLOWLY_ACCEPTANCE_PASSPHRASE=... node tooling/scripts/acceptance.mjs
 *
 * It writes real records (clearly named "Acceptance ...") into the vault, so run
 * it against a scratch deployment. It never deletes a vault and it aborts rather
 * than guessing when it meets a vault it cannot open with the acceptance
 * passphrase.
 */
const baseUrl = process.argv[2] ?? "http://127.0.0.1:8787";
const passphrase = process.env.FLOWLY_ACCEPTANCE_PASSPHRASE ?? "flowly acceptance passphrase 2026";
const archivePassword = "flowly acceptance archive password";

const results = [];
let session = { cookie: "", csrf: "" };
let created = { account: "", tag: "", transaction: "", rule: "", budget: "" };

function newUuid() {
  return crypto.randomUUID();
}

async function call(path, { method = "GET", body, auth = true, csrf = true, raw = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (auth && session.cookie) headers.cookie = session.cookie;
  if (csrf && auth && method !== "GET" && session.csrf) headers["x-flowly-csrf"] = session.csrf;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) session.cookie = setCookie.split(";")[0];
  if (raw) return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()) };
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  return { status: response.status, body: payload, headers: response.headers, text };
}

async function step(name, run) {
  try {
    const detail = await run();
    results.push({ name, ok: true, detail });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`  FAIL ${name} — ${error.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

console.log(`Flowly MVP acceptance run against ${baseUrl}\n`);

await step("health endpoint answers", async () => {
  const { status, body } = await call("/api/health", { auth: false });
  expect(status === 200 && body.status === "ok", `unexpected response ${status}`);
  return `v${body.version}`;
});

await step("vault is created or unlocked", async () => {
  const created = await call("/api/vault/create", {
    method: "POST",
    auth: false,
    csrf: false,
    body: { passphrase },
  });
  if (created.status === 201) {
    session.csrf = created.body.csrfToken;
    return "created a new vault";
  }
  expect(
    created.status === 409,
    `create returned ${created.status}: ${JSON.stringify(created.body)}`,
  );
  const unlocked = await call("/api/vault/unlock", {
    method: "POST",
    auth: false,
    csrf: false,
    body: { passphrase },
  });
  expect(
    unlocked.status === 200,
    `an existing vault did not accept the acceptance passphrase (${unlocked.status}); ` +
      "point the script at a scratch vault or set FLOWLY_ACCEPTANCE_PASSPHRASE",
  );
  session.csrf = unlocked.body.csrfToken;
  return "unlocked the existing vault";
});

await step("account is created", async () => {
  created.account = newUuid();
  const now = new Date().toISOString();
  const { status } = await call("/api/accounts", {
    method: "POST",
    body: {
      entity: {
        formatVersion: 1,
        revision: 1,
        id: created.account,
        name: "Acceptance Checking",
        type: "checking",
        defaultCurrency: "EUR",
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  expect(status === 201, `account create returned ${status}`);
  return "Acceptance Checking (EUR)";
});

await step("tag is created", async () => {
  created.tag = newUuid();
  const now = new Date().toISOString();
  const { status } = await call("/api/tags", {
    method: "POST",
    body: {
      entity: {
        formatVersion: 1,
        revision: 1,
        id: created.tag,
        name: "Acceptance Coffee",
        normalizedName: "acceptance coffee",
        color: "#8a2be2",
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  expect(status === 201, `tag create returned ${status}`);
  return "Acceptance Coffee";
});

await step("tagging rule is created", async () => {
  created.rule = newUuid();
  const now = new Date().toISOString();
  const { status } = await call("/api/tagging-rules", {
    method: "POST",
    body: {
      entity: {
        formatVersion: 1,
        revision: 1,
        id: created.rule,
        name: "Acceptance espresso rule",
        enabled: true,
        combinator: "and",
        conditions: [{ field: "userNote", operator: "contains", value: "espresso" }],
        tagIds: [created.tag],
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  expect(status === 201, `rule create returned ${status}`);
  return "note contains espresso";
});

await step("rule tags a new transaction", async () => {
  created.transaction = newUuid();
  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const { status, body } = await call("/api/transactions", {
    method: "POST",
    body: {
      entity: {
        formatVersion: 1,
        revision: 1,
        id: created.transaction,
        accountId: created.account,
        bookingDate: today,
        amountMinor: -1230,
        currency: "EUR",
        payee: "Acceptance Bar",
        userNote: "espresso with Luca",
        status: "booked",
        source: "manual",
        tagIds: [],
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  expect(status === 201, `transaction create returned ${status}`);
  expect(
    body.entity.tagIds.includes(created.tag),
    "the tagging rule did not add its tag to the new transaction",
  );
  return "tag applied automatically";
});

await step("second transaction is recorded", async () => {
  const now = new Date().toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const { status } = await call("/api/transactions", {
    method: "POST",
    body: {
      entity: {
        formatVersion: 1,
        revision: 1,
        id: newUuid(),
        accountId: created.account,
        bookingDate: today,
        amountMinor: -4000,
        currency: "EUR",
        payee: "Acceptance Market",
        status: "booked",
        source: "manual",
        tagIds: [created.tag],
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  expect(status === 201, `transaction create returned ${status}`);
});

await step("search finds the note text", async () => {
  const { status, body } = await call("/api/transactions?q=espresso");
  expect(status === 200, `search returned ${status}`);
  expect(body.total >= 1, "search returned no match for the note text");
  return `${body.total} match(es)`;
});

await step("dashboard aggregates the data", async () => {
  const today = new Date();
  const from = `${today.toISOString().slice(0, 7)}-01`;
  const to = today.toISOString().slice(0, 10);
  const { status, body } = await call(`/api/dashboard?from=${from}&to=${to}`);
  expect(status === 200, `dashboard returned ${status}`);
  const flow = body.cashFlow.find((entry) => entry.currency === "EUR");
  expect(flow && flow.expensesMinor >= 5230, "expected spending to be included");
  const tagSpending = body.spendingByTag.find(
    (entry) => entry.tagName === "Acceptance Coffee" && entry.currency === "EUR",
  );
  expect(tagSpending && tagSpending.spentMinor >= 5230, "expected tagged spending to be included");
  return `expenses ${flow.expensesMinor} EUR, tagged ${tagSpending.spentMinor} EUR`;
});

await step("budget reports consumption", async () => {
  created.budget = newUuid();
  const now = new Date().toISOString();
  const { status } = await call("/api/budgets", {
    method: "POST",
    body: {
      entity: {
        formatVersion: 1,
        revision: 1,
        id: created.budget,
        name: "Acceptance budget",
        amountMinor: 10000,
        currency: "EUR",
        period: "monthly",
        startDate: `${new Date().toISOString().slice(0, 7)}-01`,
        tagIds: [created.tag],
        rollover: false,
        active: true,
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  expect(status === 201, `budget create returned ${status}`);
  const consumption = await call("/api/budgets/consumption");
  expect(consumption.status === 200, `consumption returned ${consumption.status}`);
  const entry = consumption.body.items.find((item) => item.name === "Acceptance budget");
  expect(entry, "the budget is missing from the consumption report");
  expect(entry.spentMinor >= 5230, `expected at least 5230 spent, got ${entry.spentMinor}`);
  return `${entry.spentMinor} of ${entry.limitMinor} ${entry.currency} (${entry.status})`;
});

await step("concurrent edits are rejected instead of overwritten", async () => {
  const current = await call(`/api/accounts/${created.account}`);
  expect(current.status === 200, `account read returned ${current.status}`);
  const entity = current.body.entity;
  const first = await call(`/api/accounts/${created.account}`, {
    method: "PUT",
    body: { entity: { ...entity, name: `${entity.name} (edited)` } },
  });
  expect(first.status === 200, `first edit returned ${first.status}`);
  const stale = await call(`/api/accounts/${created.account}`, {
    method: "PUT",
    body: { entity: { ...entity, name: "Acceptance stale write" } },
  });
  expect(stale.status === 409, `stale edit returned ${stale.status}, expected 409`);
});

await step("transaction CSV exports", async () => {
  const { status, text } = await call("/api/export/transactions.csv");
  expect(status === 200, `csv export returned ${status}`);
  expect(
    text.includes("Acceptance Bar"),
    "the exported CSV does not contain the created transaction",
  );
  return `${text.split("\r\n").length - 2} rows`;
});

await step("complete archive exports", async () => {
  const { status, buffer } = await call("/api/export/archive", {
    method: "POST",
    body: { password: archivePassword },
    raw: true,
  });
  expect(status === 200, `archive export returned ${status}`);
  expect(buffer.length > 100, "the archive looks empty");
  return `${(buffer.length / 1024).toFixed(1)} KiB`;
});

await step("wrong passphrase is rejected", async () => {
  await call("/api/vault/lock", { method: "POST", body: { scope: "all" } });
  const { status } = await call("/api/vault/unlock", {
    method: "POST",
    auth: false,
    csrf: false,
    body: { passphrase: "definitely not the passphrase" },
  });
  expect(status === 401, `wrong passphrase returned ${status}, expected 401`);
});

await step("lock and unlock around a restart", async () => {
  const locked = await call("/api/vault/status", { auth: false });
  expect(locked.body.state === "locked", "the vault should be locked after lock-all");
  const unlocked = await call("/api/vault/unlock", {
    method: "POST",
    auth: false,
    csrf: false,
    body: { passphrase },
  });
  expect(unlocked.status === 200, `unlock returned ${unlocked.status}`);
  session.csrf = unlocked.body.csrfToken;
  const transactions = await call(`/api/transactions?accountId=${created.account}`);
  expect(transactions.body.total >= 2, "the data did not survive the lock/unlock cycle");
});

await step("rate limiting protects unlock", async () => {
  await call("/api/vault/lock", { method: "POST", body: { scope: "all" } });
  let sawRateLimit = false;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { status } = await call("/api/vault/unlock", {
      method: "POST",
      auth: false,
      csrf: false,
      body: { passphrase: "wrong passphrase" },
    });
    if (status === 429) {
      sawRateLimit = true;
      break;
    }
  }
  expect(sawRateLimit, "repeated wrong passphrases were never rate limited");
  const unlocked = await call("/api/vault/unlock", {
    method: "POST",
    auth: false,
    csrf: false,
    body: { passphrase },
  });
  expect(
    unlocked.status === 200 || unlocked.status === 429,
    `unlock after the rate limit returned ${unlocked.status}`,
  );
  if (unlocked.status === 200) session.csrf = unlocked.body.csrfToken;
});

const failed = results.filter((result) => !result.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed against ${baseUrl}`,
);
if (failed.length > 0) {
  console.log("Failed checks:");
  for (const failure of failed) console.log(`  - ${failure.name}: ${failure.detail}`);
  process.exit(1);
}
console.log("The MVP behaves as documented. Notes:");
console.log(
  "  - the run left 'Acceptance …' records in the vault; delete them from the UI when you are done",
);
console.log("  - unlock attempts may be rate limited for a minute afterwards; that is expected");
