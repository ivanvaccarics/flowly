import { describe, expect, it } from "vitest";
import { TransactionSearchService, parseTransactionQuery } from "../src/application/search.js";
import { createAccount } from "../src/domain/account.js";
import { createTag } from "../src/domain/tag.js";
import { createTransaction } from "../src/domain/transaction.js";
import { Vault } from "../src/vault/vault.js";
import { cleanup, tempDir, TEST_KDF } from "./helpers/test-utils.js";

const NOW = "2026-09-01T08:00:00.000Z";
const CHECKING = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
const CREDIT = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e70";
const COFFEE = "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081";

async function setup() {
  const dir = tempDir("flowly-search-");
  const vault = await Vault.create(dir, "correct horse battery staple", { kdf: TEST_KDF });
  await vault.accounts.create(
    createAccount(
      { name: "Everyday", type: "checking", defaultCurrency: "EUR" },
      { id: CHECKING, now: NOW },
    ),
  );
  await vault.accounts.create(
    createAccount(
      { name: "Credit", type: "credit-card", defaultCurrency: "EUR" },
      { id: CREDIT, now: NOW },
    ),
  );
  await vault.tags.create(createTag({ name: "Coffee" }, { id: COFFEE, now: NOW }));

  const rows = [
    {
      id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f01",
      accountId: CHECKING,
      bookingDate: "2026-09-03",
      amountMinor: -1230,
      currency: "EUR",
      payee: "Bar Centrale",
      userNote: "espresso with Luca",
      tagIds: [COFFEE],
    },
    {
      id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f02",
      accountId: CHECKING,
      bookingDate: "2026-09-10",
      amountMinor: -8000,
      currency: "EUR",
      payee: "Supermarket",
      description: "CARD PURCHASE",
    },
    {
      id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f03",
      accountId: CREDIT,
      bookingDate: "2026-10-01",
      amountMinor: -1500,
      currency: "USD",
      payee: "New York Café",
    },
    {
      id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f04",
      accountId: CHECKING,
      bookingDate: "2026-10-05",
      amountMinor: 250000,
      currency: "EUR",
      payee: "Employer",
      status: "pending" as const,
    },
  ];
  for (const row of rows) {
    await vault.transactions.create(createTransaction(row as never, { id: row.id, now: NOW }));
  }
  return { dir, vault, service: new TransactionSearchService(vault) };
}

describe("transaction search", () => {
  it("returns everything by default, newest first", async () => {
    const { dir, vault, service } = await setup();
    try {
      const result = await service.search();
      expect(result.total).toBe(4);
      expect(result.items.map((item) => item.bookingDate)).toEqual([
        "2026-10-05",
        "2026-10-01",
        "2026-09-10",
        "2026-09-03",
      ]);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("filters by account, date range, currency and status", async () => {
    const { dir, vault, service } = await setup();
    try {
      expect((await service.search({ accountId: CREDIT })).total).toBe(1);
      expect((await service.search({ fromDate: "2026-09-01", toDate: "2026-09-30" })).total).toBe(
        2,
      );
      expect((await service.search({ currency: "USD" })).total).toBe(1);
      expect((await service.search({ status: "pending" })).total).toBe(1);
      expect((await service.search({ source: "manual" })).total).toBe(4);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("filters by tag and amount range", async () => {
    const { dir, vault, service } = await setup();
    try {
      expect((await service.search({ tagIds: [COFFEE] })).total).toBe(1);
      expect((await service.search({ maxAmountMinor: -5000 })).total).toBe(1);
      expect((await service.search({ maxAmountMinor: -1000 })).total).toBe(3);
      expect((await service.search({ minAmountMinor: 0 })).total).toBe(1);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("searches text case-insensitively across payee, description and notes", async () => {
    const { dir, vault, service } = await setup();
    try {
      expect((await service.search({ text: "ESPRESSO" })).total).toBe(1);
      expect((await service.search({ text: "café" })).total).toBe(1);
      expect((await service.search({ text: "card purchase" })).total).toBe(1);
      expect((await service.search({ text: "supermarket" })).total).toBe(1);
      expect((await service.search({ text: "nothing here" })).total).toBe(0);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("paginates with a stable total", async () => {
    const { dir, vault, service } = await setup();
    try {
      const first = await service.search({ limit: 2 });
      expect(first.items).toHaveLength(2);
      expect(first.total).toBe(4);
      const second = await service.search({ limit: 2, offset: 2 });
      expect(second.items).toHaveLength(2);
      expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("parses HTTP query parameters defensively", () => {
    expect(
      parseTransactionQuery({
        accountId: CHECKING,
        from: "2026-09-01",
        to: "2026-09-30",
        tags: `${COFFEE},${COFFEE}`,
        q: " espresso ",
        minAmountMinor: "-5000",
        limit: "1000",
        offset: "-3",
        status: "sideways",
      }),
    ).toEqual({
      accountId: CHECKING,
      fromDate: "2026-09-01",
      toDate: "2026-09-30",
      tagIds: [COFFEE, COFFEE],
      text: "espresso",
      minAmountMinor: -5000,
      limit: 500,
    });
  });
});
