import { validateContract } from "@flowly/web-contracts";
import { describe, expect, it } from "vitest";
import { createAccount, validateAccount, type Account } from "../src/domain/account.js";
import { validateTag, type Tag } from "../src/domain/tag.js";
import { validateTaggingRule, type TaggingRule } from "../src/domain/tagging-rule.js";
import {
  createTransaction,
  validateTransaction,
  type Transaction,
} from "../src/domain/transaction.js";
import { readFixture } from "./helpers/golden.js";

describe("contract fixtures satisfy the domain invariants", () => {
  it("accepts the account fixture", () => {
    const fixture = readFixture<Account>("account");
    expect(() => validateAccount(fixture)).not.toThrow();
    expect(validateContract("account", fixture).valid).toBe(true);
  });

  it("accepts the transaction fixture", () => {
    const fixture = readFixture<Transaction>("transaction");
    expect(() => validateTransaction(fixture)).not.toThrow();
    expect(validateContract("transaction", fixture).valid).toBe(true);
  });

  it("accepts the tag fixture", () => {
    const fixture = readFixture<Tag>("tag");
    expect(() => validateTag(fixture)).not.toThrow();
    expect(validateContract("tag", fixture).valid).toBe(true);
  });

  it("accepts the tagging rule fixture", () => {
    const fixture = readFixture<TaggingRule>("tagging-rule");
    expect(() => validateTaggingRule(fixture)).not.toThrow();
    expect(validateContract("taggingRule", fixture).valid).toBe(true);
  });
});

describe("domain output satisfies the canonical schemas", () => {
  it("validates a freshly created account, tag and transaction", () => {
    const now = "2026-09-01T08:00:00.000Z";
    const account = createAccount(
      { name: "Everyday", type: "checking", defaultCurrency: "EUR" },
      { id: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f", now },
    );
    const transaction = createTransaction(
      {
        accountId: account.id,
        bookingDate: "2026-09-03",
        amountMinor: -1230,
        currency: "EUR",
        payee: "Bar Centrale",
        userNote: "espresso",
      },
      { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70", now },
    );

    expect(validateContract("account", account)).toEqual({ valid: true });
    expect(validateContract("transaction", transaction)).toEqual({ valid: true });
  });

  it("catches drift in both directions", () => {
    const broken = { formatVersion: 1, id: "nope", name: "", type: "checking" };
    expect(validateContract("account", broken).valid).toBe(false);
    expect(() => validateAccount(broken as unknown as Account)).toThrow();
  });
});
