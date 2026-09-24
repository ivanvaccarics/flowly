#!/usr/bin/env node
/**
 * Fills a scratch vault with synthetic demo data, so the README screenshots can
 * be regenerated and the app can be looked at with something in it.
 *
 *   node tooling/scripts/seed-demo.mjs [baseUrl] [--create]
 *   FLOWLY_DEMO_PASSPHRASE=... node tooling/scripts/seed-demo.mjs
 *
 * Every value here is invented: no provider identifier, no real merchant and no
 * account number ever appears. The script refuses to touch a vault that already
 * has accounts, so it can never seed over somebody's real data.
 */
const args = process.argv.slice(2);
const allowCreate = args.includes("--create");
const baseUrl = args.find((argument) => argument.startsWith("http")) ?? "http://127.0.0.1:8787";
const passphrase = process.env.FLOWLY_DEMO_PASSPHRASE ?? "flowly demo passphrase 2026";

const session = { cookie: "", csrf: "" };
const ids = { accounts: {}, tags: {}, rules: {} };

/** Deterministic jitter, so two runs of the seed look the same. */
function random(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const jitter = random(20260922);

async function call(path, { method = "GET", body, auth = true, csrf = true } = {}) {
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
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  return { status: response.status, body: payload };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const today = new Date();
const iso = (date) => date.toISOString().slice(0, 10);

/** The months the demo covers: this one and the three before it. */
function monthStart(offset) {
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - offset, 1));
}

function dayIn(month, day) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day));
}

function isPast(date) {
  return date <= today;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

async function create(kind, entity, label) {
  const { status, body } = await call(`/api/${kind}`, { method: "POST", body: { entity } });
  expect(status === 201, `${label} returned ${status}: ${JSON.stringify(body)}`);
  return entity;
}

console.log(`Flowly demo seed against ${baseUrl}\n`);

const health = await call("/api/health", { auth: false });
expect(health.status === 200, "the server did not answer /api/health; is it running?");

const status = await call("/api/vault/status", { auth: false });
if (status.body.vaultExists === false) {
  expect(allowCreate, "no vault exists here; re-run with --create to build a scratch one");
  const created = await call("/api/vault/create", {
    method: "POST",
    auth: false,
    csrf: false,
    body: { passphrase },
  });
  expect(created.status === 201, `create returned ${created.status}`);
  session.csrf = created.body.csrfToken;
  console.log("  ok   created a scratch vault");
} else {
  const unlocked = await call("/api/vault/unlock", {
    method: "POST",
    auth: false,
    csrf: false,
    body: { passphrase },
  });
  expect(
    unlocked.status === 200,
    `the vault did not accept the demo passphrase (${unlocked.status}); point the seed at a ` +
      "scratch vault or set FLOWLY_DEMO_PASSPHRASE",
  );
  session.csrf = unlocked.body.csrfToken;
  console.log("  ok   unlocked the existing vault");
}

const existing = await call("/api/accounts");
expect(
  Array.isArray(existing.body.items) && existing.body.items.length === 0,
  "this vault already holds accounts; the seed only fills an empty scratch vault",
);

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

// --- accounts ---------------------------------------------------------------
const accountSpecs = [
  { key: "checking", name: "Everyday Checking", type: "checking" },
  { key: "savings", name: "Savings Account", type: "savings" },
  { key: "card", name: "Credit Card", type: "credit-card" },
  { key: "closed", name: "Old Savings", type: "savings" },
];
for (const spec of accountSpecs) {
  const id = newId();
  ids.accounts[spec.key] = id;
  await create(
    "accounts",
    {
      formatVersion: 1,
      revision: 1,
      id,
      name: spec.name,
      type: spec.type,
      defaultCurrency: "EUR",
      institutionName: "Demo Bank",
      createdAt: now(),
      updatedAt: now(),
    },
    `account ${spec.name}`,
  );
}
console.log(`  ok   ${accountSpecs.length} accounts`);

// --- tags -------------------------------------------------------------------
const tagSpecs = [
  { key: "bills", name: "Bollette", color: "#7c3aed" },
  { key: "groceries", name: "Alimentari", color: "#10b981" },
  { key: "transport", name: "Trasporti", color: "#1d4ed8" },
  { key: "leisure", name: "Svago", color: "#d4af37" },
  { key: "salary", name: "Stipendio", color: "#0f766e" },
  { key: "home", name: "Casa", color: "#ef4444" },
];
for (const spec of tagSpecs) {
  const id = newId();
  ids.tags[spec.key] = id;
  await create(
    "tags",
    {
      formatVersion: 1,
      revision: 1,
      id,
      name: spec.name,
      normalizedName: spec.name.toLowerCase(),
      color: spec.color,
      createdAt: now(),
      updatedAt: now(),
    },
    `tag ${spec.name}`,
  );
}
console.log(`  ok   ${tagSpecs.length} tags`);

// --- rules ------------------------------------------------------------------
const ruleSpecs = [
  {
    key: "salary",
    name: "Monthly salary",
    conditions: [{ field: "userNote", operator: "contains", value: "salary" }],
    tags: ["salary"],
  },
  {
    key: "groceries",
    name: "Weekly groceries",
    conditions: [{ field: "payee", operator: "contains", value: "Market" }],
    tags: ["groceries"],
  },
  {
    key: "bills",
    name: "Household utilities",
    conditions: [{ field: "payee", operator: "contains", value: "Utility" }],
    tags: ["bills"],
  },
  {
    key: "transport",
    name: "Metro and buses",
    conditions: [{ field: "payee", operator: "contains", value: "Metro" }],
    tags: ["transport"],
  },
  {
    key: "big",
    name: "Large outflows (paused)",
    enabled: false,
    combinator: "or",
    conditions: [
      { field: "amount", operator: "lessThan", value: "-150.00", currency: "EUR" },
      { field: "payee", operator: "is", value: "Landlord Demo" },
    ],
    tags: ["home"],
  },
];
for (const spec of ruleSpecs) {
  const id = newId();
  ids.rules[spec.key] = id;
  await create(
    "tagging-rules",
    {
      formatVersion: 3,
      kind: "match",
      revision: 1,
      id,
      name: spec.name,
      enabled: spec.enabled ?? true,
      combinator: spec.combinator ?? "and",
      conditions: spec.conditions,
      tagIds: spec.tags.map((key) => ids.tags[key]),
      createdAt: now(),
      updatedAt: now(),
    },
    `rule ${spec.name}`,
  );
}
console.log(`  ok   ${ruleSpecs.length} rules`);

// --- transactions -----------------------------------------------------------
/** A synthetic movement; amounts are minor units, like every stored amount. */
function movement({ date, amountMinor, payee, note, account = "checking", status = "booked" }) {
  return {
    formatVersion: 1,
    revision: 1,
    id: newId(),
    accountId: ids.accounts[account],
    bookingDate: iso(date),
    amountMinor,
    currency: "EUR",
    status,
    source: "manual",
    tagIds: [],
    createdAt: now(),
    updatedAt: now(),
    ...(payee ? { payee } : {}),
    ...(note ? { userNote: note } : {}),
  };
}

const rows = [];
for (let offset = 3; offset >= 0; offset -= 1) {
  const month = monthStart(offset);
  const monthName = MONTH_NAMES[month.getUTCMonth()];

  const salary = dayIn(month, 27);
  if (isPast(salary)) {
    rows.push(
      movement({
        date: salary,
        amountMinor: 245000,
        payee: "Employer Inc",
        note: `Salary ${monthName}`,
      }),
    );
  }

  // A second income early in the month, so the current month is never all
  // expenses just because the salary has not landed yet.
  const consultingDay = offset === 0 ? Math.min(2, today.getUTCDate()) : 2;
  const consulting = dayIn(month, consultingDay);
  if (isPast(consulting)) {
    rows.push(
      movement({
        date: consulting,
        amountMinor: 68000,
        payee: "Consulting Client",
        note: `consulting fee ${monthName}`,
      }),
    );
  }

  const rent = dayIn(month, 1);
  if (isPast(rent)) {
    rows.push(movement({ date: rent, amountMinor: -95000, payee: "Landlord Demo", note: "rent" }));
  }

  const transfer = dayIn(month, 28);
  if (isPast(transfer)) {
    rows.push(
      movement({
        date: transfer,
        amountMinor: -50000,
        payee: "Savings transfer",
        note: "monthly savings",
      }),
    );
    rows.push(
      movement({
        date: transfer,
        account: "savings",
        amountMinor: 50000,
        payee: "Everyday Checking",
        note: "monthly savings",
      }),
    );
  }

  const utility = dayIn(month, 5);
  if (isPast(utility)) {
    rows.push(
      movement({
        date: utility,
        amountMinor: -(7800 + Math.round(jitter() * 2000)),
        payee: "Utility Provider",
        note: "electricity and gas",
      }),
    );
  }

  const telecom = dayIn(month, 12);
  if (isPast(telecom)) {
    rows.push(
      movement({
        date: telecom,
        account: "card",
        amountMinor: -2990,
        payee: "Telecom Demo",
        note: "monthly plan",
      }),
    );
  }

  // Groceries land on the Saturdays of the month.
  for (let day = 1; day <= 28; day += 1) {
    const date = dayIn(month, day);
    if (date.getUTCDay() !== 6 || !isPast(date)) continue;
    rows.push(
      movement({
        date,
        amountMinor: -(5200 + Math.round(jitter() * 4200)),
        payee: "Market Demo",
        note: jitter() > 0.5 ? "weekly groceries" : undefined,
      }),
    );
  }

  for (const [day, fare] of [
    [3, 170],
    [9, 250],
    [17, 170],
    [24, 420],
  ]) {
    const date = dayIn(month, day);
    if (!isPast(date)) continue;
    rows.push(movement({ date, amountMinor: -fare, payee: "Metro Transit", note: "ticket" }));
  }

  const leisure = dayIn(month, 18);
  if (isPast(leisure)) {
    rows.push(
      movement({
        date: leisure,
        account: "card",
        amountMinor: -4500,
        payee: "Gym Demo",
        note: "monthly membership",
      }),
    );
  }

  const streaming = dayIn(month, 21);
  if (isPast(streaming)) {
    rows.push(
      movement({
        date: streaming,
        account: "card",
        amountMinor: -999,
        payee: "Streaming Demo",
        note: "subscription",
      }),
    );
  }

  const coffee = dayIn(month, 14);
  if (isPast(coffee)) {
    rows.push(
      movement({
        date: coffee,
        amountMinor: -420,
        payee: "Bar Centrale",
        note: "espresso with a colleague",
      }),
    );
  }

  const pharmacy = dayIn(month, 8);
  if (isPast(pharmacy)) {
    rows.push(
      movement({
        date: pharmacy,
        amountMinor: -2480,
        payee: "Pharmacy Demo",
        note: "prescription",
      }),
    );
  }
}

// The two newest movements are still pending, so the ledger shows both states.
const pending = rows.slice(-2);
for (const row of pending) row.status = "pending";

rows.sort((a, b) => (a.bookingDate < b.bookingDate ? -1 : 1));
let tagged = 0;
for (const row of rows) {
  const created = await call("/api/transactions", { method: "POST", body: { entity: row } });
  expect(created.status === 201, `transaction on ${row.bookingDate} returned ${created.status}`);
  if ((created.body.entity?.tagIds ?? []).length > 0) tagged += 1;
}
console.log(`  ok   ${rows.length} movements (${tagged} tagged by the rules)`);

// The fourth account is archived, so Accounts shows both states.
const closed = await call(`/api/accounts/${ids.accounts.closed}`);
const archived = await call(`/api/accounts/${ids.accounts.closed}/archive`, {
  method: "POST",
  body: { revision: closed.body.entity.revision },
});
expect(archived.status === 200, `archiving the demo account returned ${archived.status}`);
console.log("  ok   one account archived");

const stats = await call("/api/tagging-rules/stats");
console.log(
  `\nSeeded ${baseUrl}: ${rows.length} movements, ${stats.body.matched ?? 0} covered by rules.`,
);
console.log(`Passphrase for the screenshots: ${passphrase}`);
