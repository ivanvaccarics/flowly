import { describe, expect, it } from "vitest";
import { TaggingRuleService } from "../src/application/tagging-rule-service.js";
import { createAccount } from "../src/domain/account.js";
import { DomainError } from "../src/domain/errors.js";
import { createTag } from "../src/domain/tag.js";
import { createTransaction } from "../src/domain/transaction.js";
import type { TaggingRule } from "../src/domain/tagging-rule.js";
import { Vault, VaultLockedError } from "../src/vault/vault.js";
import { cleanup, tempDir, TEST_KDF } from "./helpers/test-utils.js";

const NOW = "2026-09-01T08:00:00.000Z";
const ACCOUNT_ID = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
const OTHER_ACCOUNT_ID = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e70";
const COFFEE_TAG = "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081";
const RENT_TAG = "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7082";

async function setupVault(): Promise<{ vault: Vault; dir: string; service: TaggingRuleService }> {
  const dir = tempDir("flowly-tagging-");
  const vault = await Vault.create(dir, "correct horse battery staple", { kdf: TEST_KDF });
  await vault.accounts.create(
    createAccount(
      { name: "Everyday", type: "checking", defaultCurrency: "EUR" },
      { id: ACCOUNT_ID, now: NOW },
    ),
  );
  await vault.accounts.create(
    createAccount(
      { name: "Credit", type: "credit-card", defaultCurrency: "EUR" },
      {
        id: OTHER_ACCOUNT_ID,
        now: NOW,
      },
    ),
  );
  await vault.tags.create(createTag({ name: "Coffee" }, { id: COFFEE_TAG, now: NOW }));
  await vault.tags.create(createTag({ name: "Rent" }, { id: RENT_TAG, now: NOW }));
  return { vault, dir, service: new TaggingRuleService(vault) };
}

function coffeeRule(overrides: Partial<TaggingRule> = {}): TaggingRule {
  return {
    formatVersion: 3,
    kind: "match",
    revision: 1,
    id: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7081",
    name: "Coffee",
    enabled: true,
    combinator: "and",
    conditions: [{ field: "userNote", operator: "contains", value: "espresso" }],
    tagIds: [COFFEE_TAG],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("tagging rules in the vault", () => {
  it("tags new transactions through the service", async () => {
    const { vault, dir, service } = await setupVault();
    try {
      await vault.taggingRules.create(coffeeRule());
      const transaction = await service.createWithRules(
        createTransaction(
          {
            accountId: ACCOUNT_ID,
            bookingDate: "2026-09-03",
            amountMinor: -1230,
            currency: "EUR",
            userNote: "espresso with Luca",
          },
          { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70", now: NOW },
        ),
      );
      expect(transaction.tagIds).toEqual([COFFEE_TAG]);
      const stored = await vault.transactions.get(transaction.id);
      expect(stored?.tagIds).toEqual([COFFEE_TAG]);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("keeps manual tags and never duplicates rule tags", async () => {
    const { vault, dir, service } = await setupVault();
    try {
      await vault.taggingRules.create(coffeeRule());
      const rules = await service.rules();
      const transaction = createTransaction(
        {
          accountId: ACCOUNT_ID,
          bookingDate: "2026-09-03",
          amountMinor: -1230,
          currency: "EUR",
          userNote: "espresso",
          tagIds: [COFFEE_TAG],
        },
        { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f71", now: NOW },
      );
      const result = service.withRuleTags(transaction, rules);
      expect(result.addedTagIds).toEqual([]);
      expect(result.transaction.tagIds).toEqual([COFFEE_TAG]);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("backfills existing transactions and is idempotent", async () => {
    const { vault, dir, service } = await setupVault();
    try {
      await vault.taggingRules.create(coffeeRule());
      await vault.taggingRules.create(
        coffeeRule({
          id: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7082",
          name: "Rent",
          conditions: [
            { field: "amount", operator: "lessThan", value: "-500.00", currency: "EUR" },
          ],
          tagIds: [RENT_TAG],
        }),
      );
      await vault.transactions.create(
        createTransaction(
          {
            accountId: ACCOUNT_ID,
            bookingDate: "2026-09-03",
            amountMinor: -1230,
            currency: "EUR",
            userNote: "espresso",
          },
          { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f72", now: NOW },
        ),
      );
      await vault.transactions.create(
        createTransaction(
          {
            accountId: ACCOUNT_ID,
            bookingDate: "2026-10-01",
            amountMinor: -95000,
            currency: "EUR",
            userNote: "october rent",
          },
          { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f73", now: NOW },
        ),
      );

      const first = await service.backfill();
      expect(first).toMatchObject({ evaluated: 2, changed: 2 });
      const second = await service.backfill();
      expect(second).toMatchObject({ evaluated: 2, changed: 0 });

      const transactions = await vault.transactions.list();
      const rent = transactions.find((transaction) => transaction.bookingDate === "2026-10-01");
      expect(rent?.tagIds).toEqual([RENT_TAG]);

      const scoped = await service.backfill({ accountId: OTHER_ACCOUNT_ID });
      expect(scoped.evaluated).toBe(0);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("skips disabled rules and fails once locked", async () => {
    const { vault, dir, service } = await setupVault();
    await vault.taggingRules.create(coffeeRule({ enabled: false }));
    const rules = await service.rules();
    const transaction = createTransaction(
      {
        accountId: ACCOUNT_ID,
        bookingDate: "2026-09-03",
        amountMinor: -1230,
        currency: "EUR",
        userNote: "espresso",
      },
      { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f74", now: NOW },
    );
    expect(service.withRuleTags(transaction, rules).addedTagIds).toEqual([]);

    await vault.lock();
    await expect(vault.taggingRules.list()).rejects.toThrow(VaultLockedError);
    cleanup(dir);
  });

  it("reports what the stored rules cover and what a draft would cover", async () => {
    const { vault, dir, service } = await setupVault();
    try {
      await vault.taggingRules.create(coffeeRule());
      await vault.taggingRules.create(
        coffeeRule({
          id: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7082",
          name: "Rent",
          conditions: [
            { field: "amount", operator: "lessThan", value: "-500.00", currency: "EUR" },
          ],
          tagIds: [RENT_TAG],
        }),
      );
      // A paused rule is reported, and reports zero: it never matches.
      await vault.taggingRules.create(
        coffeeRule({
          id: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7083",
          name: "Paused",
          enabled: false,
        }),
      );

      const rows: Array<{ id: string; bookingDate: string; amountMinor: number; note: string }> = [
        {
          id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f71",
          bookingDate: "2026-09-03",
          amountMinor: -1230,
          note: "espresso with Luca",
        },
        {
          id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f72",
          bookingDate: "2026-09-10",
          amountMinor: -800,
          note: "another espresso",
        },
        {
          id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f73",
          bookingDate: "2026-10-01",
          amountMinor: -95000,
          note: "october rent",
        },
        {
          id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f74",
          bookingDate: "2026-10-05",
          amountMinor: -4000,
          note: "groceries",
        },
      ];
      for (const row of rows) {
        await vault.transactions.create(
          createTransaction(
            {
              accountId: ACCOUNT_ID,
              bookingDate: row.bookingDate,
              amountMinor: row.amountMinor,
              currency: "EUR",
              userNote: row.note,
            },
            { id: row.id, now: NOW },
          ),
        );
      }

      const stats = await service.stats();
      expect(stats.evaluated).toBe(4);
      expect(stats.matched).toBe(3);
      expect(stats.byRule).toEqual([
        { ruleId: coffeeRule().id, matches: 2 },
        { ruleId: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7082", matches: 1 },
        { ruleId: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7083", matches: 0 },
      ]);
      // Tags count matched transactions, most covered first.
      expect(stats.byTag).toEqual([
        { tagId: COFFEE_TAG, transactions: 2 },
        { tagId: RENT_TAG, transactions: 1 },
      ]);

      // The preview evaluates the draft against the newest rows first.
      const espresso = {
        combinator: "and" as const,
        conditions: [
          { field: "userNote" as const, operator: "contains" as const, value: "espresso" },
        ],
      };
      expect(await service.preview(espresso)).toEqual({ evaluated: 4, matched: 2 });
      expect(await service.preview(espresso, 2)).toEqual({ evaluated: 2, matched: 0 });
      await expect(
        service.preview({
          combinator: "and",
          conditions: [{ field: "userNote", operator: "contains", value: "" }],
        }),
      ).rejects.toThrow(DomainError);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });
});

function transferRule(overrides: Partial<TaggingRule> = {}): TaggingRule {
  return {
    formatVersion: 3,
    kind: "transfer-pair",
    revision: 1,
    id: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7082",
    name: "Giroconti",
    enabled: true,
    tagIds: [],
    outgoing: {
      combinator: "and",
      conditions: [{ field: "payee", operator: "contains", value: "savings" }],
    },
    incoming: {
      combinator: "and",
      conditions: [{ field: "payee", operator: "contains", value: "everyday" }],
    },
    windowDays: 3,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

async function seedLeg(
  vault: Vault,
  id: string,
  input: { accountId: string; amountMinor: number; payee: string; bookingDate?: string },
) {
  return vault.transactions.create(
    createTransaction(
      {
        accountId: input.accountId,
        bookingDate: input.bookingDate ?? "2026-09-28",
        amountMinor: input.amountMinor,
        currency: "EUR",
        payee: input.payee,
      },
      { id, now: NOW },
    ),
  );
}

describe("transfer rules in the vault", () => {
  it("marks both legs of a transfer and leaves them in the ledger", async () => {
    const { vault, dir, service } = await setupVault();
    try {
      await vault.taggingRules.create(transferRule());
      await seedLeg(vault, "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f80", {
        accountId: ACCOUNT_ID,
        amountMinor: -50000,
        payee: "Savings account",
      });
      const incoming = await seedLeg(vault, "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f81", {
        accountId: OTHER_ACCOUNT_ID,
        amountMinor: 50000,
        payee: "Everyday account",
        bookingDate: "2026-09-30",
      });

      // The second leg arriving is what completes the pair: the sync and the CSV
      // import hand the rows they just wrote to exactly this call.
      expect(await service.markTransfers([incoming])).toBe(1);
      const stored = await vault.transactions.list();
      expect(stored.map((transaction) => transaction.transfer)).toEqual([true, true]);

      // Idempotent: nothing is left to decide, so nothing happens again.
      expect(await service.markTransfers(stored)).toBe(0);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("never overturns an answer the user already gave", async () => {
    const { vault, dir, service } = await setupVault();
    try {
      await vault.taggingRules.create(transferRule());
      await seedLeg(vault, "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f82", {
        accountId: ACCOUNT_ID,
        amountMinor: -50000,
        payee: "Savings account",
      });
      const incoming = await seedLeg(vault, "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f83", {
        accountId: OTHER_ACCOUNT_ID,
        amountMinor: 50000,
        payee: "Everyday account",
      });
      await vault.transactions.update({ ...incoming, transfer: false }, incoming.revision);

      expect(await service.markTransfers([incoming])).toBe(0);
      const stored = await vault.transactions.list();
      expect(stored.filter((transaction) => transaction.transfer === true)).toHaveLength(0);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("reports the pairs a backfill recognised", async () => {
    const { vault, dir, service } = await setupVault();
    try {
      await vault.taggingRules.create(transferRule());
      await seedLeg(vault, "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f84", {
        accountId: ACCOUNT_ID,
        amountMinor: -50000,
        payee: "Savings account",
      });
      await seedLeg(vault, "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f85", {
        accountId: OTHER_ACCOUNT_ID,
        amountMinor: 50000,
        payee: "Everyday account",
      });

      const first = await service.backfill();
      expect(first).toMatchObject({ evaluated: 2, changed: 0, transferPairs: 1 });
      const stored = await vault.transactions.list();
      expect(stored.every((transaction) => transaction.transfer === true)).toBe(true);

      const second = await service.backfill();
      expect(second).toMatchObject({ transferPairs: 0 });
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });
});
