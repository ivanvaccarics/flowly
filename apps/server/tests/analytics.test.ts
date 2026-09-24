import { describe, expect, it } from "vitest";
import { AnalyticsService } from "../src/application/analytics.js";
import { fixedClock } from "../src/domain/clock.js";
import { createAccount } from "../src/domain/account.js";
import { createTag } from "../src/domain/tag.js";
import { createTransaction } from "../src/domain/transaction.js";
import { Vault } from "../src/vault/vault.js";
import { cleanup, tempDir, TEST_KDF } from "./helpers/test-utils.js";

const NOW = "2026-09-01T08:00:00.000Z";
const CLOCK = fixedClock(NOW);
const CHECKING = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
const CREDIT = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e70";
const GROCERIES = "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081";
const RENT = "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7082";

let counter = 0;
function id(prefix = "018f2c1e-6d5b-7c3a-9f2e-"): string {
  counter += 1;
  return `${prefix}${String(counter).padStart(12, "0")}`;
}

async function setup() {
  const dir = tempDir("flowly-analytics-");
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
  await vault.tags.create(createTag({ name: "Groceries" }, { id: GROCERIES, now: NOW }));
  await vault.tags.create(createTag({ name: "Rent" }, { id: RENT, now: NOW }));

  const seed = async (overrides: Record<string, unknown>) => {
    await vault.transactions.create(
      createTransaction(
        {
          accountId: CHECKING,
          bookingDate: "2026-09-05",
          amountMinor: -1000,
          currency: "EUR",
          ...overrides,
        } as never,
        { id: id(), now: NOW },
      ),
    );
  };

  await seed({ amountMinor: 250000, bookingDate: "2026-09-01", payee: "Employer" });
  await seed({
    amountMinor: -4000,
    bookingDate: "2026-09-05",
    tagIds: [GROCERIES],
    payee: "Market",
  });
  await seed({
    amountMinor: -1000,
    bookingDate: "2026-09-06",
    tagIds: [GROCERIES],
    payee: "Bakery",
  });
  await seed({ amountMinor: -95000, bookingDate: "2026-09-30", tagIds: [RENT], payee: "Landlord" });
  await seed({
    amountMinor: -500,
    bookingDate: "2026-08-31",
    tagIds: [GROCERIES],
    payee: "August market",
  });
  await seed({ amountMinor: -2000, bookingDate: "2026-09-07", currency: "USD", payee: "USD shop" });
  await seed({
    amountMinor: -1000,
    bookingDate: "2026-09-08",
    status: "pending",
    payee: "Pending",
  });
  await seed({
    accountId: CREDIT,
    amountMinor: -3000,
    bookingDate: "2026-09-09",
    tagIds: [GROCERIES],
    payee: "Credit market",
  });

  return { dir, vault, service: new AnalyticsService(vault, CLOCK) };
}

describe("dashboard scope", () => {
  it("counts only the selected months, and only the selected tags", async () => {
    const { dir, vault, service } = await setup();
    try {
      // August holds a single tagged movement; September holds the rest.
      const september = await service.dashboard({
        from: "2026-09-01",
        to: "2026-09-30",
        months: ["2026-09"],
      });
      expect(september.cashFlow[0]).toMatchObject({
        currency: "EUR",
        incomeMinor: 250000,
        // Rent 95000 + groceries 4000 + 1000 + 3000 = 103000 in EUR.
        expensesMinor: 103000,
      });
      // A month bucket covers its own month, even where nothing happened.
      expect(september.cashFlowBuckets.filter((bucket) => bucket.currency === "EUR")).toEqual([
        {
          currency: "EUR",
          label: "Sep 2026",
          from: "2026-09-01",
          to: "2026-09-30",
          incomeMinor: 250000,
          expensesMinor: 103000,
        },
      ]);
      // The categories still describe the whole period, so they can be re-picked.
      expect(september.spendingByTag.map((entry) => entry.tagName)).toEqual(["Rent", "Groceries"]);

      // Only the grocery months, with only the grocery tag selected.
      const groceries = await service.dashboard({
        from: "2026-08-01",
        to: "2026-09-30",
        months: ["2026-08", "2026-09"],
        tagIds: [GROCERIES],
      });
      expect(groceries.cashFlow[0]).toMatchObject({ currency: "EUR", incomeMinor: 0 });
      // Groceries: 4000 + 1000 + 3000 in September, 500 in August.
      expect(groceries.cashFlow[0]?.expensesMinor).toBe(8500);
      expect(
        groceries.cashFlowBuckets.map((bucket) => [bucket.label, bucket.expensesMinor]),
      ).toEqual([
        ["Aug 2026", 500],
        ["Sep 2026", 8000],
      ]);

      // A month nobody selected never leaks into the totals.
      const december = await service.dashboard({
        from: "2026-08-01",
        to: "2026-12-31",
        months: ["2026-12"],
      });
      expect(december.cashFlow).toEqual([]);
      expect(december.spendingByTag).toEqual([]);
      expect(december.balances.length).toBeGreaterThan(0);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });
});

describe("balances", () => {
  it("keeps one line per account and currency and never blends", async () => {
    const { dir, vault, service } = await setup();
    try {
      const balances = await service.balances();
      const everyday = balances.find(
        (line) => line.accountId === CHECKING && line.currency === "EUR",
      );
      const dollars = balances.find(
        (line) => line.accountId === CHECKING && line.currency === "USD",
      );
      const credit = balances.find((line) => line.accountId === CREDIT);
      // salary - groceries - bakery - rent - august groceries (booked only)
      expect(everyday?.balanceMinor).toBe(149500);
      expect(dollars?.balanceMinor).toBe(-2000);
      expect(dollars?.isDefaultCurrency).toBe(false);
      expect(credit?.balanceMinor).toBe(-3000);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });
});

describe("cash flow", () => {
  it("computes income, expenses and net per currency for booked rows only", async () => {
    const { dir, vault, service } = await setup();
    try {
      const flow = await service.cashFlow({ from: "2026-09-01", to: "2026-09-30" });
      expect(flow).toEqual([
        {
          currency: "EUR",
          incomeMinor: 250000,
          expensesMinor: 103000,
          netMinor: 147000,
          transactionCount: 5,
        },
        {
          currency: "USD",
          incomeMinor: 0,
          expensesMinor: 2000,
          netMinor: -2000,
          transactionCount: 1,
        },
      ]);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("groups spending by tag and currency", async () => {
    const { dir, vault, service } = await setup();
    try {
      const spending = await service.spendingByTag({ from: "2026-09-01", to: "2026-09-30" });
      expect(spending).toEqual([
        {
          tagId: RENT,
          tagName: "Rent",
          currency: "EUR",
          spentMinor: 95000,
          transactionCount: 1,
        },
        {
          tagId: GROCERIES,
          tagName: "Groceries",
          currency: "EUR",
          spentMinor: 8000,
          transactionCount: 3,
        },
      ]);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });
});

describe("dashboard", () => {
  it("is deterministic for the same inputs and refreshes after a write", async () => {
    const { dir, vault, service } = await setup();
    try {
      const first = await service.dashboard({ from: "2026-09-01", to: "2026-09-30" });
      const second = await service.dashboard({ from: "2026-09-01", to: "2026-09-30" });
      expect(second).toEqual(first);

      await vault.transactions.create(
        createTransaction(
          {
            accountId: CHECKING,
            bookingDate: "2026-09-20",
            amountMinor: -100,
            currency: "EUR",
            payee: "Late coffee",
          },
          { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f98", now: NOW },
        ),
      );
      const third = await service.dashboard({ from: "2026-09-01", to: "2026-09-30" });
      expect(third).not.toEqual(first);
      const eur = third.cashFlow.find((entry) => entry.currency === "EUR");
      expect(eur?.expensesMinor).toBe(103100);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });
});

describe("transfers between the user's own accounts", () => {
  const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30", months: ["2026-09"] };

  it("leaves them out of income, spending and the chart, and keeps them in the balance", async () => {
    const { dir, vault, service } = await setup();
    try {
      const before = await service.dashboard(SEPTEMBER);
      const leg = async (accountId: string, amountMinor: number, tagIds: string[] = []) => {
        await vault.transactions.create(
          createTransaction(
            {
              accountId,
              bookingDate: "2026-09-28",
              amountMinor,
              currency: "EUR",
              payee: "Savings transfer",
              tagIds,
              transfer: true,
            },
            { id: id(), now: NOW },
          ),
        );
      };
      // Both legs, one of them tagged: a transfer is not spending even when it
      // carries a tag, which is exactly what the donut used to show.
      await leg(CHECKING, -50000, [GROCERIES]);
      await leg(CREDIT, 50000);

      const after = await service.dashboard(SEPTEMBER);
      expect(after.cashFlow).toEqual(before.cashFlow);
      expect(after.cashFlowBuckets).toEqual(before.cashFlowBuckets);
      expect(after.spendingByTag).toEqual(before.spendingByTag);

      // The ledger and the balance keep counting the money that really moved.
      const line = (dashboard: typeof after, accountId: string) =>
        dashboard.balances.find((entry) => entry.accountId === accountId);
      expect(line(after, CHECKING)).toMatchObject({
        balanceMinor: (line(before, CHECKING)?.balanceMinor ?? 0) - 50000,
        transactionCount: (line(before, CHECKING)?.transactionCount ?? 0) + 1,
      });
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("still counts a movement nobody has decided on", async () => {
    const { dir, vault, service } = await setup();
    try {
      const before = await service.dashboard(SEPTEMBER);
      await vault.transactions.create(
        createTransaction(
          {
            accountId: CHECKING,
            bookingDate: "2026-09-29",
            amountMinor: 70000,
            currency: "EUR",
            payee: "Undecided",
          },
          { id: id(), now: NOW },
        ),
      );
      const after = await service.dashboard(SEPTEMBER);
      const income = (dashboard: typeof before) =>
        dashboard.cashFlow.find((entry) => entry.currency === "EUR")?.incomeMinor ?? 0;
      expect(income(after)).toBe(income(before) + 70000);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });
});
