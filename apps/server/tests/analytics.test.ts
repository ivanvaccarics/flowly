import { describe, expect, it } from "vitest";
import { AnalyticsService } from "../src/application/analytics.js";
import { fixedClock } from "../src/domain/clock.js";
import { createAccount } from "../src/domain/account.js";
import { createTag } from "../src/domain/tag.js";
import { createTransaction } from "../src/domain/transaction.js";
import type { Budget } from "../src/domain/budget.js";
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

function budget(
  overrides: Partial<Budget> & { clearTagIds?: boolean; clearAccountIds?: boolean } = {},
): Budget {
  const { clearTagIds, clearAccountIds, ...rest } = overrides;
  const base: Budget = {
    formatVersion: 1,
    revision: 1,
    id: "018f2c1e-6d5b-7c3a-9f2e-5c4d5e6f7081",
    name: "Groceries",
    amountMinor: 10000,
    currency: "EUR",
    period: "monthly",
    startDate: "2026-01-01",
    tagIds: [GROCERIES],
    rollover: false,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...rest,
  };
  if (clearTagIds) delete base.tagIds;
  if (clearAccountIds) delete base.accountIds;
  return base;
}

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

describe("budget consumption", () => {
  it("computes the period, the spend and the status", async () => {
    const { dir, vault, service } = await setup();
    try {
      await vault.budgets.create(budget());
      const [progress] = await service.budgetProgress("2026-09-15");
      expect(progress).toMatchObject({
        name: "Groceries",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        limitMinor: 10000,
        spentMinor: 8000,
        remainingMinor: 2000,
        percentUsed: 80,
        status: "warning",
        rolloverCarryMinor: 0,
        skippedOtherCurrencies: 0,
      });
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("flags warning and over budgets", async () => {
    const { dir, vault, service } = await setup();
    try {
      await vault.budgets.create(
        budget({ id: "018f2c1e-6d5b-7c3a-9f2e-5c4d5e6f7082", amountMinor: 10000 }),
      );
      await vault.budgets.create({
        ...budget({ id: "018f2c1e-6d5b-7c3a-9f2e-5c4d5e6f7083", amountMinor: 5000 }),
        name: "Over",
      });
      const progress = await service.budgetProgress("2026-09-15");
      const warning = progress.find((entry) => entry.budgetId.endsWith("7082"));
      const over = progress.find((entry) => entry.budgetId.endsWith("7083"));
      expect(warning?.status).toBe("warning");
      expect(warning?.percentUsed).toBe(80);
      expect(over?.status).toBe("over");
      expect(over?.remainingMinor).toBe(-3000);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("excludes other currencies and counts them as skipped", async () => {
    const { dir, vault, service } = await setup();
    try {
      await vault.budgets.create(
        budget({
          id: "018f2c1e-6d5b-7c3a-9f2e-5c4d5e6f7084",
          name: "All spending",
          amountMinor: 100000,
          clearTagIds: true,
          clearAccountIds: true,
          currency: "EUR",
        }),
      );
      const progress = await service.budgetProgress("2026-09-15");
      const entry = progress.find((candidate) => candidate.name === "All spending");
      expect(entry?.spentMinor).toBe(103000);
      expect(entry?.skippedOtherCurrencies).toBe(1);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("counts explicit converted amounts instead of converting implicitly", async () => {
    const { dir, vault, service } = await setup();
    try {
      await vault.transactions.create({
        ...createTransaction(
          {
            accountId: CHECKING,
            bookingDate: "2026-09-12",
            amountMinor: -5000,
            currency: "USD",
            payee: "Converted shop",
          },
          { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f99", now: NOW },
        ),
        originalAmountMinor: -4500,
        originalCurrency: "EUR",
      });
      await vault.budgets.create(
        budget({
          id: "018f2c1e-6d5b-7c3a-9f2e-5c4d5e6f7085",
          name: "Converted",
          amountMinor: 100000,
          clearTagIds: true,
        }),
      );
      const progress = await service.budgetProgress("2026-09-15");
      const entry = progress.find((candidate) => candidate.name === "Converted");
      expect(entry?.spentMinor).toBe(107500); // 103000 EUR + 4500 converted
      expect(entry?.skippedOtherCurrencies).toBe(1); // the USD transaction without conversion
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("carries the previous period surplus only when rollover is enabled", async () => {
    const { dir, vault, service } = await setup();
    try {
      await vault.budgets.create(
        budget({
          id: "018f2c1e-6d5b-7c3a-9f2e-5c4d5e6f7086",
          name: "Rollover",
          amountMinor: 10000,
          rollover: true,
        }),
      );
      const progress = await service.budgetProgress("2026-09-15");
      const entry = progress.find((candidate) => candidate.name === "Rollover");
      // August spent 500 on groceries, so 9500 carries into September.
      expect(entry?.rolloverCarryMinor).toBe(9500);
      expect(entry?.limitMinor).toBe(19500);
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
      await vault.budgets.create(budget());
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
