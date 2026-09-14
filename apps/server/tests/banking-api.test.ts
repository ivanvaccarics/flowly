import { afterEach, describe, expect, it } from "vitest";
import { appState } from "../src/api/app.js";
import {
  FakeBank,
  TEST_APP_ID,
  TEST_REDIRECT_URL,
  connectBank,
  get,
  post,
  put,
  sampleTransaction,
  startBankingHarness,
  testPrivateKeyPem,
  type BankingHarness,
} from "./helpers/banking.js";
import { makeConfig } from "./helpers/api.js";
import { isPublicAddress } from "../src/api/banking-routes.js";

const openHarnesses: BankingHarness[] = [];

async function harness(bank = new FakeBank()): Promise<BankingHarness> {
  const created = await startBankingHarness(makeConfig().config, bank);
  openHarnesses.push(created);
  return created;
}

afterEach(async () => {
  for (const open of openHarnesses.splice(0)) await open.close();
});

interface ConnectionStatus {
  configured: boolean;
  connection?: {
    appId: string;
    appName?: string;
    environment: string;
    redirectUrl: string;
    keyFingerprint: string;
    autoSync: boolean;
  };
  links: Array<{
    id: string;
    aspspName: string;
    status: string;
    authorizationUrl?: string;
    accounts: Array<{
      id: string;
      providerAccountUid: string;
      status: string;
      accountId?: string;
      accountName?: string;
      currency?: string;
      lastBalanceMinor?: number;
      lastBalanceCurrency?: string;
      ledgerBalanceMinor?: number;
      ledgerBalanceCurrency?: string;
    }>;
  }>;
  sync: { running: boolean; lastSyncAt?: string };
}

describe("Enable Banking API", () => {
  it("forwards the PSU address only when it can mean something to a bank", () => {
    for (const address of ["203.0.113.9", "8.8.8.8", "2001:4860:4860::8888"]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
    for (const address of [
      "127.0.0.1",
      "::1",
      "10.0.0.5",
      "192.168.1.20",
      "172.16.9.9",
      "169.254.1.1",
      "100.87.190.124", // Tailscale hands out the shared 100.64/10 range.
      "fd7a:115c:a1e0::1",
      "fe80::1%en0",
      "::ffff:192.168.1.5",
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
  });

  it("starts unconfigured and never leaks the private key", async () => {
    const { app, client } = await harness();
    const before = await get({ app, client } as BankingHarness, "/api/banking/status");
    expect(before.json<ConnectionStatus>().configured).toBe(false);

    const saved = await put(
      { app, client } as BankingHarness,
      "/api/banking/enable-banking/config",
      {
        appId: TEST_APP_ID,
        privateKeyPem: testPrivateKeyPem(),
        redirectUrl: TEST_REDIRECT_URL,
        environment: "SANDBOX",
        country: "IT",
      },
    );
    expect(saved.statusCode).toBe(200);
    expect(saved.body).not.toContain("PRIVATE KEY");

    const status = await get({ app, client } as BankingHarness, "/api/banking/status");
    const body = status.json<ConnectionStatus>();
    expect(body.configured).toBe(true);
    expect(body.connection).toMatchObject({
      appId: TEST_APP_ID,
      appName: "mytest-app",
      environment: "SANDBOX",
      redirectUrl: TEST_REDIRECT_URL,
      autoSync: true,
    });
    expect(body.connection?.keyFingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(status.body).not.toContain("PRIVATE KEY");
  });

  it("rejects credentials whose redirect URL is not registered", async () => {
    const { app, client } = await harness();
    const response = await put(
      { app, client } as BankingHarness,
      "/api/banking/enable-banking/config",
      {
        appId: TEST_APP_ID,
        privateKeyPem: testPrivateKeyPem(),
        redirectUrl: "https://elsewhere.test/callback",
        environment: "SANDBOX",
      },
    );
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string; detail?: { redirectUrls?: string[] } }>().error).toBe(
      "bank_redirect_not_registered",
    );
  });

  it("rejects a key that belongs to the other environment", async () => {
    const bank = new FakeBank({ application: { environment: "PRODUCTION" } });
    const { app, client } = await harness(bank);
    const response = await put(
      { app, client } as BankingHarness,
      "/api/banking/enable-banking/config",
      {
        appId: TEST_APP_ID,
        privateKeyPem: testPrivateKeyPem(),
        redirectUrl: TEST_REDIRECT_URL,
        environment: "SANDBOX",
      },
    );
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe("bank_environment_mismatch");
  });

  it("lists the banks the user can connect, with sandbox credentials", async () => {
    const { app, client } = await harness();
    await connectBank({ app, client } as BankingHarness);
    const response = await get(
      { app, client } as BankingHarness,
      "/api/banking/enable-banking/aspsps?country=IT",
    );
    expect(response.statusCode).toBe(200);
    const items = response.json<{
      items: Array<{
        name: string;
        country: string;
        psuTypes: string[];
        maximumConsentDays?: number;
        sandboxUsers: Array<{ username?: string; otp?: string }>;
        methods: Array<{ approach: string; credentials: unknown[] }>;
      }>;
    }>().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "UniCredit",
      country: "IT",
      psuTypes: ["personal", "business"],
      maximumConsentDays: 90,
    });
    expect(items[0]?.sandboxUsers[0]?.username).toBe("customera");
  });

  it("walks the authorization flow and pairs the discovered account", async () => {
    const { app, client } = await harness();
    const { linkId } = await connectBank({ app, client } as BankingHarness);

    const status = await get({ app, client } as BankingHarness, "/api/banking/status");
    const body = status.json<ConnectionStatus>();
    expect(body.links).toHaveLength(1);
    expect(body.links[0]).toMatchObject({
      id: linkId,
      aspspName: "UniCredit",
      status: "authorized",
    });
    expect(body.links[0]?.accounts[0]).toMatchObject({
      status: "unmapped",
      currency: "EUR",
    });

    const uid = body.links[0]?.accounts[0]?.providerAccountUid as string;
    const mapped = await post(
      { app, client } as BankingHarness,
      `/api/banking/enable-banking/links/${linkId}/accounts`,
      { providerAccountUid: uid, mode: "create", name: "Conto UniCredit", type: "checking" },
    );
    expect(mapped.statusCode).toBe(200);
    const accountId = mapped.json<ConnectionStatus["links"][number]>().accounts[0]
      ?.accountId as string;
    expect(accountId).toMatch(/^[0-9a-f-]{36}$/);

    const accounts = await get({ app, client } as BankingHarness, "/api/accounts");
    const created = accounts.json<{
      items: Array<{ id: string; name: string; institutionName?: string }>;
    }>().items;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      id: accountId,
      name: "Conto UniCredit",
      institutionName: "UniCredit",
    });
  });

  it("pairs an existing Flowly account instead of creating one", async () => {
    const { app, client } = await harness();
    const { linkId } = await connectBank({ app, client } as BankingHarness);
    const existing = await post({ app, client } as BankingHarness, "/api/accounts", {
      entity: {
        formatVersion: 1,
        revision: 1,
        id: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
        name: "Everyday",
        type: "checking",
        defaultCurrency: "EUR",
        createdAt: "2026-09-01T08:00:00.000Z",
        updatedAt: "2026-09-01T08:00:00.000Z",
      },
    });
    expect(existing.statusCode).toBe(201);

    const status = await get({ app, client } as BankingHarness, "/api/banking/status");
    const uid = status.json<ConnectionStatus>().links[0]?.accounts[0]?.providerAccountUid as string;
    const mapped = await post(
      { app, client } as BankingHarness,
      `/api/banking/enable-banking/links/${linkId}/accounts`,
      { providerAccountUid: uid, mode: "pair", accountId: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f" },
    );
    expect(mapped.statusCode).toBe(200);
    const account = mapped.json<ConnectionStatus["links"][number]>().accounts[0];
    expect(account).toMatchObject({
      status: "mapped",
      accountId: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
      accountName: "Everyday",
    });
  });

  it("refuses a bank account whose currency Flowly cannot store", async () => {
    const bank = new FakeBank({
      accounts: [
        {
          uid: "0f7d3d1c-3f4e-4b0e-9f1a-2b3c4d5e6f71",
          cash_account_type: "CACC",
          currency: "RON",
          details: "Conto in lei",
        },
      ],
    });
    const { app, client } = await harness(bank);
    const { linkId } = await connectBank({ app, client } as BankingHarness);
    const response = await post(
      { app, client } as BankingHarness,
      `/api/banking/enable-banking/links/${linkId}/accounts`,
      { providerAccountUid: "0f7d3d1c-3f4e-4b0e-9f1a-2b3c4d5e6f71", mode: "create" },
    );
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe("bank_currency_required");
  });

  it("rejects a replayed callback and unlinks without touching transactions", async () => {
    const bank = new FakeBank();
    const { app, client } = await harness(bank);
    const { linkId, state } = await connectBank({ app, client } as BankingHarness);

    const replay = await post(
      { app, client } as BankingHarness,
      "/api/banking/enable-banking/callback",
      { code: "sandbox-code", state },
    );
    expect(replay.statusCode).toBe(400);
    expect(replay.json<{ error: string }>().error).toBe("bank_state_invalid");

    const status = await get({ app, client } as BankingHarness, "/api/banking/status");
    const uid = status.json<ConnectionStatus>().links[0]?.accounts[0]?.providerAccountUid as string;
    await post(
      { app, client } as BankingHarness,
      `/api/banking/enable-banking/links/${linkId}/accounts`,
      { providerAccountUid: uid, mode: "create" },
    );
    await post({ app, client } as BankingHarness, "/api/banking/sync", {});
    const transactions = await get({ app, client } as BankingHarness, "/api/transactions");
    expect(transactions.json<{ items: unknown[] }>().items).toHaveLength(1);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/banking/enable-banking/links/${linkId}`,
      headers: { cookie: client.cookie, "x-flowly-csrf": client.csrf },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json<{ deletedAccounts: number }>().deletedAccounts).toBe(1);
    expect(bank.deletedSessions).toHaveLength(1);

    const after = await get({ app, client } as BankingHarness, "/api/banking/status");
    expect(after.json<ConnectionStatus>().links).toHaveLength(0);
    const kept = await get({ app, client } as BankingHarness, "/api/transactions");
    expect(kept.json<{ items: unknown[] }>().items).toHaveLength(1);
  });

  it("finishes the bank redirect on the server, without a browser session", async () => {
    const { app, client } = await harness();
    const session = { app, client } as BankingHarness;
    await put(session, "/api/banking/enable-banking/config", {
      appId: TEST_APP_ID,
      privateKeyPem: testPrivateKeyPem(),
      redirectUrl: TEST_REDIRECT_URL,
      environment: "SANDBOX",
      psuType: "personal",
      country: "IT",
      autoSync: true,
    });
    const started = await post(session, "/api/banking/enable-banking/authorize", {
      aspspName: "UniCredit",
      aspspCountry: "IT",
      psuType: "personal",
    });
    const state = started.json<{ state: string }>().state;

    // The bank redirects the browser here: no cookie, no CSRF, no shell.
    const callback = await app.inject({
      method: "GET",
      url: `/enablebanking/auth_callback?code=sandbox-code&state=${state}`,
    });
    expect(callback.statusCode).toBe(200);
    expect(callback.headers["content-type"]).toContain("text/html");
    expect(callback.body).toContain("is connected");
    expect(callback.headers["content-security-policy"]).toContain("script-src 'sha256-");

    const status = await get(session, "/api/banking/status");
    expect(status.json<ConnectionStatus>().links[0]?.status).toBe("authorized");
  });

  it("explains a callback whose request is no longer pending", async () => {
    const { app, client } = await harness();
    const session = { app, client } as BankingHarness;
    await put(session, "/api/banking/enable-banking/config", {
      appId: TEST_APP_ID,
      privateKeyPem: testPrivateKeyPem(),
      redirectUrl: TEST_REDIRECT_URL,
      environment: "SANDBOX",
      psuType: "personal",
      country: "IT",
      autoSync: true,
    });
    const started = await post(session, "/api/banking/enable-banking/authorize", {
      aspspName: "UniCredit",
      aspspCountry: "IT",
      psuType: "personal",
    });
    const { linkId, state } = started.json<{ linkId: string; state: string }>();
    await app.inject({
      method: "DELETE",
      url: `/api/banking/enable-banking/links/${linkId}`,
      headers: { cookie: client.cookie, "x-flowly-csrf": client.csrf },
    });

    const callback = await app.inject({
      method: "GET",
      url: `/enablebanking/auth_callback?code=sandbox-code&state=${state}`,
    });
    expect(callback.statusCode).toBe(400);
    expect(callback.body).toContain("no pending request");
  });

  it("records a refused consent and stops the panel waiting", async () => {
    const bank = new FakeBank();
    const { app, client } = await harness(bank);
    const session = { app, client } as BankingHarness;
    await put(session, "/api/banking/enable-banking/config", {
      appId: TEST_APP_ID,
      privateKeyPem: testPrivateKeyPem(),
      redirectUrl: TEST_REDIRECT_URL,
      environment: "SANDBOX",
      psuType: "personal",
      country: "IT",
      autoSync: true,
    });
    const started = await post(session, "/api/banking/enable-banking/authorize", {
      aspspName: "UniCredit",
      aspspCountry: "IT",
      psuType: "personal",
    });
    const state = started.json<{ state: string }>().state;

    const callback = await app.inject({
      method: "GET",
      url: `/enablebanking/auth_callback?error=access_denied&state=${state}`,
    });
    expect(callback.statusCode).toBe(400);
    expect(callback.body).toContain("You cancelled the consent");

    const link = (await get(session, "/api/banking/status")).json<ConnectionStatus>().links[0];
    expect(link?.status).toBe("failed");
  });

  it("tells the browser to unlock when the vault is locked", async () => {
    const { app, client } = await harness();
    const session = { app, client } as BankingHarness;
    await put(session, "/api/banking/enable-banking/config", {
      appId: TEST_APP_ID,
      privateKeyPem: testPrivateKeyPem(),
      redirectUrl: TEST_REDIRECT_URL,
      environment: "SANDBOX",
      psuType: "personal",
      country: "IT",
      autoSync: true,
    });
    const started = await post(session, "/api/banking/enable-banking/authorize", {
      aspspName: "UniCredit",
      aspspCountry: "IT",
      psuType: "personal",
    });
    const state = started.json<{ state: string }>().state;
    await post(session, "/api/vault/lock", { scope: "all" });

    const callback = await app.inject({
      method: "GET",
      url: `/enablebanking/auth_callback?code=sandbox-code&state=${state}`,
    });
    expect(callback.statusCode).toBe(423);
    expect(callback.body).toContain("Flowly is locked");
  });

  it("keeps the bank page reachable while a link waits for the bank", async () => {
    const { app, client } = await harness();
    const session = { app, client } as BankingHarness;
    await put(session, "/api/banking/enable-banking/config", {
      appId: TEST_APP_ID,
      privateKeyPem: testPrivateKeyPem(),
      redirectUrl: TEST_REDIRECT_URL,
      environment: "SANDBOX",
      psuType: "personal",
      country: "IT",
      autoSync: true,
    });
    const started = await post(session, "/api/banking/enable-banking/authorize", {
      aspspName: "UniCredit",
      aspspCountry: "IT",
      psuType: "personal",
    });
    const url = started.json<{ url: string }>().url;

    const status = await get(session, "/api/banking/status");
    const link = status.json<ConnectionStatus>().links[0];
    expect(link?.status).toBe("pending");
    expect(link?.authorizationUrl).toBe(url);
  });

  it("reports the balance the bank sent as the balance of the paired account", async () => {
    const bank = new FakeBank();
    const { app, client } = await harness(bank);
    const session = { app, client } as BankingHarness;
    const { linkId } = await connectBank(session);
    const uid = (await get(session, "/api/banking/status")).json<ConnectionStatus>().links[0]
      ?.accounts[0]?.providerAccountUid as string;
    const mapped = await post(session, `/api/banking/enable-banking/links/${linkId}/accounts`, {
      providerAccountUid: uid,
      mode: "create",
      name: "Conto UniCredit",
      type: "checking",
    });
    const accountId = mapped.json<ConnectionStatus["links"][number]>().accounts[0]?.accountId;
    await post(session, "/api/banking/sync", {});

    const synced = (await get(session, "/api/banking/status")).json<ConnectionStatus>();
    const account = synced.links[0]?.accounts[0];
    // The bank reports 1234.56 even though the only imported movement is a
    // 3.75 debit: the bank's figure is the account's balance.
    expect(account?.lastBalanceMinor).toBe(123456);
    expect(account?.lastBalanceCurrency).toBe("EUR");
    expect(account && "ledgerBalanceMinor" in account).toBe(false);

    // ...and the rest of the platform reads that same figure.
    const dashboard = await get(session, "/api/dashboard?from=2026-09-01&to=2026-09-30");
    expect(
      dashboard.json<{ balances: Array<Record<string, unknown>> }>().balances[0],
    ).toMatchObject({
      accountId,
      currency: "EUR",
      balanceMinor: 123456,
      transactionCount: 1,
    });
  });

  it("auto-syncs nothing when no bank is linked and reports a clear sync state", async () => {
    const { app, client } = await harness();
    const response = await post({ app, client } as BankingHarness, "/api/banking/sync", {});
    expect(response.statusCode).toBe(200);
    expect(response.json<{ report: { created: number } }>().report.created).toBe(0);
    const state = await get({ app, client } as BankingHarness, "/api/banking/sync");
    expect(state.json<{ running: boolean; lastSyncAt?: string }>().running).toBe(false);
    expect(state.json<{ lastSyncAt?: string }>().lastSyncAt).toBeDefined();
  });

  it("requires an unlocked vault session", async () => {
    const { app } = await harness();
    const response = await app.inject({ method: "GET", url: "/api/banking/status" });
    expect(response.statusCode).toBe(401);
  });

  it("disconnects Enable Banking entirely while keeping imported transactions", async () => {
    const bank = new FakeBank();
    const { app, client } = await harness(bank);
    const session = { app, client } as BankingHarness;
    const { linkId } = await connectBank(session);
    const status = await get(session, "/api/banking/status");
    const uid = status.json<ConnectionStatus>().links[0]?.accounts[0]?.providerAccountUid as string;
    await post(session, `/api/banking/enable-banking/links/${linkId}/accounts`, {
      providerAccountUid: uid,
      mode: "create",
    });
    await post(session, "/api/banking/sync", {});
    expect(
      (await get(session, "/api/transactions")).json<{ items: unknown[] }>().items,
    ).toHaveLength(1);

    const removed = await app.inject({
      method: "DELETE",
      url: "/api/banking/enable-banking/config",
      headers: { cookie: client.cookie, "x-flowly-csrf": client.csrf },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json<{ deletedLinks: number }>().deletedLinks).toBe(1);

    const after = await get(session, "/api/banking/status");
    expect(after.json<ConnectionStatus>().configured).toBe(false);
    expect(after.json<ConnectionStatus>().links).toHaveLength(0);
    expect(
      (await get(session, "/api/transactions")).json<{ items: unknown[] }>().items,
    ).toHaveLength(1);

    const vault = appState(app).vault();
    expect(await vault!.bankConnections.list()).toHaveLength(0);
    expect(await vault!.bankLinks.list()).toHaveLength(0);
    expect(await vault!.bankAccounts.list()).toHaveLength(0);
    expect(await vault!.bankPayloads.list()).toHaveLength(0);
    expect(bank.deletedSessions).toHaveLength(1);
  });

  it("updates settings without re-uploading the private key", async () => {
    const { app, client } = await harness();
    const session = { app, client } as BankingHarness;
    await connectBank(session);

    const updated = await put(session, "/api/banking/enable-banking/config", {
      appId: TEST_APP_ID,
      redirectUrl: TEST_REDIRECT_URL,
      environment: "SANDBOX",
      psuType: "business",
      country: "IT",
      autoSync: false,
    });
    expect(updated.statusCode).toBe(200);
    const status = updated.json<ConnectionStatus>();
    expect(status.connection).toMatchObject({ autoSync: false, psuType: "business" });
    // The stored key is reused, so the fingerprint does not change.
    expect(status.connection?.keyFingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("keeps the transaction fixture helper honest", () => {
    expect(sampleTransaction().status).toBe("BOOK");
  });
});
