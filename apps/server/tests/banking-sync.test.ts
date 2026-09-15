import { afterEach, describe, expect, it } from "vitest";
import { appState } from "../src/api/app.js";
import type { SyncReport } from "../src/banking/sync.js";
import { makeConfig, SAMPLE_TAG } from "./helpers/api.js";
import {
  FakeBank,
  connectBank,
  get,
  post,
  sampleTransaction,
  startBankingHarness,
  type BankingHarness,
} from "./helpers/banking.js";

const openHarnesses: BankingHarness[] = [];

async function harness(bank: FakeBank): Promise<BankingHarness> {
  const created = await startBankingHarness(makeConfig().config, bank);
  openHarnesses.push(created);
  return created;
}

afterEach(async () => {
  for (const open of openHarnesses.splice(0)) await open.close();
});

interface TransactionRow {
  id: string;
  revision: number;
  accountId: string;
  bookingDate: string;
  amountMinor: number;
  currency: string;
  payee?: string;
  description?: string;
  userNote?: string;
  status: string;
  source: string;
  provider?: string;
  providerAccountId?: string;
  providerTransactionId?: string;
  tagIds: string[];
}

interface StatusBody {
  links: Array<{
    id: string;
    status: string;
    lastSyncedAt?: string;
    lastSyncError?: string;
    accounts: Array<{
      providerAccountUid: string;
      accountId?: string;
      lastBalanceMinor?: number;
      lastBalanceCurrency?: string;
      lastSyncedAt?: string;
      transactionCount: number;
    }>;
  }>;
  sync: { running: boolean; lastSyncAt?: string };
}

async function mappedHarness(bank = new FakeBank()): Promise<{
  harness: BankingHarness;
  accountId: string;
  linkId: string;
}> {
  const created = await harness(bank);
  const { linkId } = await connectBank(created);
  const status = await get(created, "/api/banking/status");
  const uid = status.json<StatusBody>().links[0]?.accounts[0]?.providerAccountUid as string;
  const mapped = await post(created, `/api/banking/enable-banking/links/${linkId}/accounts`, {
    providerAccountUid: uid,
    mode: "create",
    name: "Conto corrente",
    type: "checking",
    currency: "EUR",
  });
  expect(mapped.statusCode).toBe(200);
  return {
    harness: created,
    accountId: mapped.json<StatusBody["links"][number]>().accounts[0]!.accountId as string,
    linkId,
  };
}

describe("Enable Banking sync", () => {
  it("imports transactions, keeps raw payloads and remembers the balance", async () => {
    const bank = new FakeBank();
    const { harness: session, accountId } = await mappedHarness(bank);

    const response = await post(session, "/api/banking/sync", {});
    expect(response.statusCode).toBe(200);
    const { report } = response.json<{ report: SyncReport }>();
    expect(report).toMatchObject({ links: 1, accounts: 1, fetched: 1, created: 1, failed: 0 });

    const transactions = await get(session, "/api/transactions");
    const items = transactions.json<{ items: TransactionRow[] }>().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      accountId,
      bookingDate: "2026-09-01",
      amountMinor: -375,
      currency: "EUR",
      payee: "Bar Centrale",
      status: "booked",
      source: "enable-banking",
      provider: "enable-banking",
      providerTransactionId: "6a970267-0e42-a2f0-93b8-b7c9cf4b7862",
    });

    const vault = appState(session.app).vault();
    expect(vault).not.toBeNull();
    const payloads = await vault!.bankPayloads.list();
    const kinds = payloads.map((payload) => payload.kind).sort();
    // One session payload from the authorization and one from the sync check.
    expect(kinds).toEqual(["account", "balances", "session", "session", "transactions"]);
    expect(payloads.every((payload) => payload.providerAccountUid.length > 0)).toBe(true);
    const transactionPayload = payloads.find((payload) => payload.kind === "transactions");
    // First sync: 90 days back from the fixed clock, minus the reconciliation overlap.
    expect(transactionPayload?.requestFrom).toBe("2026-06-06");
    expect(transactionPayload?.json).toMatchObject({ transactions: [{ status: "BOOK" }] });

    const status = await get(session, "/api/banking/status");
    const link = status.json<StatusBody>().links[0];
    expect(link?.lastSyncedAt).toBeDefined();
    expect(link?.accounts[0]).toMatchObject({
      lastBalanceMinor: 123456,
      lastBalanceCurrency: "EUR",
      transactionCount: 1,
    });
  });

  it("imports a row whose payee only exists in a long remittance", async () => {
    const bank = new FakeBank({
      transactions: [
        sampleTransaction({
          creditor: null,
          debtor: null,
          remittance_information: ["PAGAMENTO MAV ".repeat(30)],
        }) as never,
      ],
    });
    const { harness: session } = await mappedHarness(bank);

    const response = await post(session, "/api/banking/sync", {});
    expect(response.statusCode).toBe(200);
    expect(response.json<{ report: SyncReport }>().report).toMatchObject({
      fetched: 1,
      created: 1,
      failed: 0,
    });

    const items = (await get(session, "/api/transactions")).json<{ items: TransactionRow[] }>()
      .items;
    expect(items).toHaveLength(1);
    const payee = items[0]?.payee ?? "";
    expect(payee.startsWith("PAGAMENTO MAV")).toBe(true);
    expect([...payee].length).toBeLessThanOrEqual(120);
  });

  it("serves the raw provider record behind an imported transaction", async () => {
    const bank = new FakeBank();
    const { harness: session } = await mappedHarness(bank);
    await post(session, "/api/banking/sync", {});
    const items = (await get(session, "/api/transactions")).json<{ items: TransactionRow[] }>()
      .items;
    const id = items[0]?.id as string;

    const raw = await get(session, `/api/transactions/${id}/raw`);
    expect(raw.statusCode).toBe(200);
    const record = raw.json<{
      provider: string;
      aspspName: string;
      matchedBy: string;
      requestFrom?: string;
      raw: { entry_reference?: string; transaction_amount?: { amount?: string } };
    }>();
    expect(record.provider).toBe("enable-banking");
    expect(record.aspspName).toBe("UniCredit");
    expect(record.matchedBy).toBe("provider-transaction-id");
    expect(record.requestFrom).toBe("2026-06-06");
    expect(record.raw.entry_reference).toBe("6a970267-0e42-a2f0-93b8-b7c9cf4b7862");
    expect(record.raw.transaction_amount?.amount).toBe("3.75");
  });

  it("explains when a transaction has no provider record", async () => {
    const { harness: session, accountId } = await mappedHarness();
    const now = "2026-09-11T09:00:00.000Z";
    const created = await post(session, "/api/transactions", {
      entity: {
        formatVersion: 1,
        revision: 1,
        id: crypto.randomUUID(),
        accountId,
        bookingDate: "2026-09-10",
        amountMinor: -500,
        currency: "EUR",
        status: "booked",
        source: "manual",
        tagIds: [],
        createdAt: now,
        updatedAt: now,
      },
    });
    const id = created.json<{ entity: { id: string } }>().entity.id;

    const raw = await get(session, `/api/transactions/${id}/raw`);
    expect(raw.statusCode).toBe(404);
    expect(raw.json<{ error: string }>().error).toBe("raw_record_not_found");
  });

  it("is idempotent: a second sync changes nothing", async () => {
    const { harness: session } = await mappedHarness();
    await post(session, "/api/banking/sync", {});
    const second = await post(session, "/api/banking/sync", {});
    expect(second.json<{ report: SyncReport }>().report).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 1,
      fetched: 1,
    });
    const transactions = await get(session, "/api/transactions");
    expect(transactions.json<{ items: TransactionRow[] }>().items).toHaveLength(1);
  });

  it("reconciles a pending transaction into booked without duplicating it", async () => {
    const bank = new FakeBank({
      transactions: [sampleTransaction({ status: "PDNG", booking_date: "2026-09-02" })],
    });
    const { harness: session } = await mappedHarness(bank);
    await post(session, "/api/banking/sync", {});
    let items = (await get(session, "/api/transactions")).json<{ items: TransactionRow[] }>().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("pending");

    // The user annotates the pending row, then the bank books it.
    const annotated = { ...items[0], userNote: "nota mia" };
    const saved = await session.app.inject({
      method: "PUT",
      url: `/api/transactions/${items[0]!.id}`,
      payload: { entity: annotated },
      headers: { cookie: session.client.cookie, "x-flowly-csrf": session.client.csrf },
    });
    expect(saved.statusCode).toBe(200);

    bank.transactionPages = [[sampleTransaction({ status: "BOOK", booking_date: "2026-09-02" })]];
    const report = (await post(session, "/api/banking/sync", {})).json<{ report: SyncReport }>()
      .report;
    expect(report).toMatchObject({ created: 0, updated: 1 });
    items = (await get(session, "/api/transactions")).json<{ items: TransactionRow[] }>().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "booked", userNote: "nota mia" });
  });

  it("applies tagging rules to imported transactions", async () => {
    const { harness: session } = await mappedHarness();
    await post(session, "/api/tags", { entity: SAMPLE_TAG });
    await post(session, "/api/tagging-rules", {
      entity: {
        formatVersion: 1,
        revision: 1,
        id: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7081",
        name: "Bar",
        enabled: true,
        combinator: "and",
        conditions: [{ field: "payee", operator: "contains", value: "bar" }],
        tagIds: [SAMPLE_TAG.id],
        createdAt: "2026-09-01T08:00:00.000Z",
        updatedAt: "2026-09-01T08:00:00.000Z",
      },
    });
    await post(session, "/api/banking/sync", {});
    const items = (await get(session, "/api/transactions")).json<{ items: TransactionRow[] }>()
      .items;
    expect(items[0]?.tagIds).toEqual([SAMPLE_TAG.id]);
  });

  it("stores every pagination page and skips unsupported currencies", async () => {
    const bank = new FakeBank({
      transactions: [
        [sampleTransaction()],
        [
          sampleTransaction({
            entry_reference: "second-page-entry",
            transaction_amount: { currency: "EUR", amount: "12.30" },
            credit_debit_indicator: "CRDT",
            booking_date: "2026-09-03",
            remittance_information: ["Stipendio"],
          }),
          sampleTransaction({
            entry_reference: "unsupported-entry",
            transaction_amount: { currency: "RON", amount: "99.00" },
            booking_date: "2026-09-04",
          }),
        ],
      ],
    });
    const { harness: session } = await mappedHarness(bank);
    const report = (await post(session, "/api/banking/sync", {})).json<{ report: SyncReport }>()
      .report;
    expect(report).toMatchObject({ fetched: 3, created: 2, skipped: 1 });
    expect(report.errors.some((error) => error.message.includes("unsupported-currency"))).toBe(
      true,
    );

    const vault = appState(session.app).vault();
    const pages = (await vault!.bankPayloads.list()).filter(
      (payload) => payload.kind === "transactions",
    );
    expect(pages).toHaveLength(2);
  });

  it("marks a link expired and stops asking the bank for data", async () => {
    const bank = new FakeBank({ sessionStatus: "EXPIRED" });
    const { harness: session, linkId } = await mappedHarness(bank);
    const before = bank.calls.length;
    const report = (await post(session, "/api/banking/sync", {})).json<{ report: SyncReport }>()
      .report;
    expect(report.reconnectRequired).toEqual([linkId]);
    expect(report.created).toBe(0);
    expect(bank.calls.slice(before)).toContain(`getSession:497f6eca-6276-4993-bfeb-53cbbbba6f08`);
    expect(bank.calls.slice(before).some((call) => call.startsWith("getTransactions"))).toBe(false);

    const status = await get(session, "/api/banking/status");
    expect(status.json<StatusBody>().links[0]).toMatchObject({ status: "expired" });
    expect(status.json<StatusBody>().links[0]?.lastSyncError).toContain("expired");

    const after = bank.calls.length;
    const second = (await post(session, "/api/banking/sync", {})).json<{ report: SyncReport }>()
      .report;
    expect(second.reconnectRequired).toEqual([linkId]);
    expect(bank.calls.length).toBe(after);
  });

  it("surfaces a provider error on the link without losing the connection", async () => {
    const bank = new FakeBank({ sessionStatus: "AUTHORIZED" });
    const { harness: session } = await mappedHarness(bank);
    bank.failSessionStatusOnce = true;
    const report = (await post(session, "/api/banking/sync", {})).json<{ report: SyncReport }>()
      .report;
    expect(report.reconnectRequired).toHaveLength(1);
    const status = await get(session, "/api/banking/status");
    expect(status.json<StatusBody>().links[0]?.status).toBe("expired");
  });

  it("refreshes linked banks right after a vault unlock", async () => {
    const { harness: session } = await mappedHarness();
    // Lock and unlock again: the connector refreshes in the background.
    await session.app.inject({
      method: "POST",
      url: "/api/vault/lock",
      payload: { scope: "all" },
      headers: { cookie: session.client.cookie, "x-flowly-csrf": session.client.csrf },
    });
    const unlocked = await session.app.inject({
      method: "POST",
      url: "/api/vault/unlock",
      payload: { passphrase: "test passphrase" },
    });
    expect(unlocked.statusCode).toBe(200);
    const client = {
      cookie: (unlocked.headers["set-cookie"] as string).split(";")[0] ?? "",
      csrf: unlocked.json<{ csrfToken: string }>().csrfToken,
    };

    let items: TransactionRow[] = [];
    for (let attempt = 0; attempt < 40 && items.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      items = (await get({ ...session, client }, "/api/transactions")).json<{
        items: TransactionRow[];
      }>().items;
    }
    expect(items).toHaveLength(1);
    expect(items[0]?.source).toBe("enable-banking");
  });
});
