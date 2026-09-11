import { describe, expect, it } from "vitest";
import { createAccount, validateAccount } from "../src/domain/account.js";
import { DomainError } from "../src/domain/errors.js";
import { generateId, isGeneratedId } from "../src/domain/ids.js";
import { validateRecurringRule, type RecurringRule } from "../src/domain/recurring.js";
import { createTag, isSameTagName, validateTag } from "../src/domain/tag.js";
import {
  FINGERPRINT_VERSION,
  createTransaction,
  importFingerprint,
  validateTransaction,
} from "../src/domain/transaction.js";

const NOW = "2026-09-01T08:00:00.000Z";
const ACCOUNT_ID = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
const TAG_ID = "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081";

describe("identifiers", () => {
  it("generates UUIDv7 ids that sort by creation time", () => {
    const early = generateId(1_700_000_000_000);
    const late = generateId(1_800_000_000_000);
    expect(isGeneratedId(early)).toBe(true);
    expect(isGeneratedId(late)).toBe(true);
    expect(early < late).toBe(true);
    expect(isGeneratedId("not-a-uuid")).toBe(false);
  });
});

describe("tags", () => {
  it("normalizes names while preserving display casing", () => {
    const tag = createTag({ name: "  Caffè   Nero " }, { id: TAG_ID, now: NOW });
    expect(tag.name).toBe("Caffè   Nero");
    expect(tag.normalizedName).toBe("caffè nero");
    expect(() => validateTag(tag)).not.toThrow();
    expect(isSameTagName("Caffè Nero", "CAFFÈ   NERO")).toBe(true);
  });

  it("rejects a mismatched normalized name and bad colors", () => {
    const tag = createTag({ name: "Groceries" }, { id: TAG_ID, now: NOW });
    expect(() => validateTag({ ...tag, normalizedName: "other" })).toThrow(DomainError);
    expect(() => validateTag({ ...tag, color: "purple" })).toThrow(DomainError);
  });
});

describe("accounts", () => {
  it("creates a valid account and rejects unsupported currencies", () => {
    const account = createAccount(
      { name: "Everyday", type: "checking", defaultCurrency: "EUR" },
      { id: ACCOUNT_ID, now: NOW },
    );
    expect(account.defaultCurrency).toBe("EUR");
    expect(() => validateAccount(account)).not.toThrow();
    expect(() =>
      createAccount(
        { name: "Crypto", type: "other", defaultCurrency: "XYZ" },
        { id: ACCOUNT_ID, now: NOW },
      ),
    ).toThrow(DomainError);
  });
});

describe("transactions", () => {
  it("applies defaults and validates the record", () => {
    const transaction = createTransaction(
      {
        accountId: ACCOUNT_ID,
        bookingDate: "2026-09-03",
        amountMinor: -1230,
        currency: "EUR",
        payee: "Bar Centrale",
      },
      { id: generateId(), now: NOW },
    );
    expect(transaction.status).toBe("booked");
    expect(transaction.source).toBe("manual");
    expect(transaction.tagIds).toEqual([]);
    expect(() => validateTransaction(transaction)).not.toThrow();
  });

  it("rejects impossible dates, currencies, and tags", () => {
    const base = createTransaction(
      { accountId: ACCOUNT_ID, bookingDate: "2026-09-03", amountMinor: -1, currency: "EUR" },
      { id: generateId(), now: NOW },
    );
    expect(() => validateTransaction({ ...base, bookingDate: "2026-02-30" })).toThrow(DomainError);
    expect(() => validateTransaction({ ...base, currency: "XYZ" })).toThrow(DomainError);
    expect(() => validateTransaction({ ...base, tagIds: [base.id, base.id] })).toThrow(DomainError);
    expect(() => validateTransaction({ ...base, amountMinor: 1.5 })).toThrow(DomainError);
    expect(() => validateTransaction({ ...base, importFingerprint: "ZZZ" })).toThrow(DomainError);
  });

  it("computes a deterministic import fingerprint", () => {
    const input = {
      accountId: ACCOUNT_ID,
      bookingDate: "2026-09-03",
      amountMinor: -1230,
      currency: "EUR",
      description: "CARD   Purchase",
    };
    const fingerprint = importFingerprint(input);
    expect(FINGERPRINT_VERSION).toBe("v1");
    expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);
    expect(importFingerprint({ ...input, description: "card purchase" })).toBe(fingerprint);
    expect(importFingerprint({ ...input, amountMinor: -1231 })).not.toBe(fingerprint);
    expect(importFingerprint({ ...input, description: "OTHER" })).not.toBe(fingerprint);
  });
});

describe("recurring rules", () => {
  const rule: RecurringRule = {
    formatVersion: 1,
    revision: 1,
    id: "018f2c1e-6d5b-7c3a-9f2e-6c4d5e6f7081",
    name: "Rent",
    template: { accountId: ACCOUNT_ID, amountMinor: -95000, currency: "EUR", payee: "Landlord" },
    frequency: "monthly",
    interval: 1,
    startDate: "2026-10-31",
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("validates template invariants", () => {
    expect(() => validateRecurringRule(rule)).not.toThrow();
    expect(() => validateRecurringRule({ ...rule, interval: 0 })).toThrow(DomainError);
    expect(() => validateRecurringRule({ ...rule, endDate: "2026-09-01" })).toThrow(DomainError);
    expect(() => validateRecurringRule({ ...rule, frequency: "hourly" as never })).toThrow(
      DomainError,
    );
  });
});
