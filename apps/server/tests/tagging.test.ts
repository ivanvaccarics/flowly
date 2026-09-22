import { describe, expect, it } from "vitest";
import { TaggingRuleService } from "../src/application/tagging-rule-service.js";
import { createAccount } from "../src/domain/account.js";
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
    formatVersion: 1,
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
            { field: "amount", operator: "lessThan", value: -500, currency: "EUR" },
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
      expect(first).toEqual({ evaluated: 2, changed: 2 });
      const second = await service.backfill();
      expect(second).toEqual({ evaluated: 2, changed: 0 });

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
});
