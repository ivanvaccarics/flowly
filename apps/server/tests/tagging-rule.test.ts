import { describe, expect, it } from "vitest";
import {
  MAX_CONDITIONS_PER_RULE,
  OPERATORS_BY_FIELD,
  evaluateTaggingRules,
  findTransferPairs,
  ruleMatches,
  transferPairMatches,
  upgradeTaggingRule,
  validateTaggingRule,
  type RuleCondition,
  type TaggingRule,
  type TransferPairRule,
} from "../src/domain/tagging-rule.js";
import { DomainError } from "../src/domain/errors.js";
import { createTransaction, type Transaction } from "../src/domain/transaction.js";
import { readGolden } from "./helpers/golden.js";

interface GoldenCase {
  name: string;
  transaction: {
    accountId: string;
    bookingDate: string;
    amountMinor: number;
    currency: string;
    payee?: string;
    description?: string;
    userNote?: string;
  };
  rules: Array<{
    combinator: "and" | "or";
    enabled: boolean;
    tagIds: string[];
    conditions: RuleCondition[];
  }>;
  expectedTagIds: string[];
}

interface TaggingGolden {
  cases: GoldenCase[];
}

const golden = readGolden<TaggingGolden>("tagging-rule-evaluation");

function toRule(partial: GoldenCase["rules"][number], index: number): TaggingRule {
  return {
    formatVersion: 3,
    kind: "match",
    revision: 1,
    id: `018f2c1e-6d5b-7c3a-9f2e-9a2b3c4d5e${(60 + index).toString().padStart(2, "0")}`,
    name: `Rule ${index + 1}`,
    enabled: partial.enabled,
    combinator: partial.combinator,
    conditions: partial.conditions,
    tagIds: partial.tagIds,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
  };
}

describe("tagging rule evaluation", () => {
  it("has golden cases", () => {
    expect(golden.cases.length).toBeGreaterThan(5);
  });

  it.each(golden.cases.map((testCase) => [testCase.name, testCase] as const))(
    "matches the golden outcome: %s",
    (_name, testCase) => {
      const rules = testCase.rules.map(toRule);
      for (const rule of rules) validateTaggingRule(rule);
      expect(evaluateTaggingRules(rules, testCase.transaction)).toEqual(testCase.expectedTagIds);
    },
  );

  it("keeps the generated golden rules valid", () => {
    for (const testCase of golden.cases) {
      for (const rule of testCase.rules.map(toRule)) {
        expect(() => validateTaggingRule(rule)).not.toThrow();
      }
    }
  });
});

describe("tagging rule invariants", () => {
  const base: TaggingRule = {
    formatVersion: 3,
    kind: "match",
    revision: 1,
    id: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7081",
    name: "Coffee",
    enabled: true,
    combinator: "and",
    conditions: [{ field: "userNote", operator: "contains", value: "espresso" }],
    tagIds: ["018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081"],
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
  };

  it("accepts a valid rule", () => {
    expect(() => validateTaggingRule(base)).not.toThrow();
  });

  it("rejects rules without tags or conditions", () => {
    expect(() => validateTaggingRule({ ...base, tagIds: [] })).toThrow(DomainError);
    expect(() => validateTaggingRule({ ...base, conditions: [] })).toThrow(DomainError);
  });

  it("requires a currency on amount conditions", () => {
    expect(() =>
      validateTaggingRule({
        ...base,
        conditions: [{ field: "amount", operator: "greaterThan", value: "10.00" }],
      }),
    ).toThrow(/currency/i);
    expect(() =>
      validateTaggingRule({
        ...base,
        conditions: [{ field: "amount", operator: "greaterThan", value: "10.00", currency: "EUR" }],
      }),
    ).not.toThrow();
  });

  it("accepts decimal amounts and rejects ones the currency cannot hold", () => {
    expect(() =>
      validateTaggingRule({
        ...base,
        conditions: [{ field: "amount", operator: "lessThan", value: "-5.10", currency: "EUR" }],
      }),
    ).not.toThrow();
    // EUR has two decimals; JPY none.
    expect(() =>
      validateTaggingRule({
        ...base,
        conditions: [{ field: "amount", operator: "lessThan", value: "-5.105", currency: "EUR" }],
      }),
    ).toThrow(/decimal places|invalid/i);
    expect(() =>
      validateTaggingRule({
        ...base,
        conditions: [{ field: "amount", operator: "greaterThan", value: "5.5", currency: "JPY" }],
      }),
    ).toThrow(/decimal places|invalid/i);
    expect(() =>
      validateTaggingRule({
        ...base,
        conditions: [{ field: "amount", operator: "equals", value: "-5.10", currency: "XYZ" }],
      }),
    ).toThrow(/currency/i);
  });

  it("compares a decimal amount condition as exact minor units", () => {
    const rule: TaggingRule = {
      ...base,
      conditions: [{ field: "amount", operator: "equals", value: "-5.10", currency: "EUR" }],
    };
    const target = { accountId: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f", currency: "EUR" };
    expect(ruleMatches(rule, { ...target, amountMinor: -510 })).toBe(true);
    expect(ruleMatches(rule, { ...target, amountMinor: -511 })).toBe(false);
    expect(ruleMatches(rule, { ...target, amountMinor: -510, currency: "USD" })).toBe(false);
  });

  it("upgrades a stored v1 amount condition into the current format", () => {
    const legacy = {
      ...base,
      formatVersion: 1,
      conditions: [
        { field: "userNote", operator: "contains", value: "espresso" },
        { field: "amountMinor", operator: "lessThan", value: -510, currency: "EUR" },
      ],
    };
    const upgraded = upgradeTaggingRule(legacy);
    expect(upgraded?.formatVersion).toBe(3);
    expect(upgraded?.kind).toBe("match");
    expect(upgraded?.conditions).toEqual([
      { field: "userNote", operator: "contains", value: "espresso" },
      { field: "amount", operator: "lessThan", value: "-5.10", currency: "EUR" },
    ]);
    expect(() => validateTaggingRule(upgraded as TaggingRule)).not.toThrow();
    // A current rule is left alone, so unlock never rewrites it.
    expect(upgradeTaggingRule(base)).toBeUndefined();
  });

  it("rejects operators that do not belong to the field", () => {
    expect(() =>
      validateTaggingRule({
        ...base,
        conditions: [{ field: "userNote", operator: "greaterThan", value: 1 }],
      }),
    ).toThrow(DomainError);
    expect(OPERATORS_BY_FIELD.userNote).toEqual(["contains"]);
    expect(OPERATORS_BY_FIELD.payee).toContain("is");
  });

  it("caps the number of conditions and tags", () => {
    const conditions = Array.from({ length: MAX_CONDITIONS_PER_RULE + 1 }, () => ({
      field: "userNote" as const,
      operator: "contains" as const,
      value: "x",
    }));
    expect(() => validateTaggingRule({ ...base, conditions })).toThrow(/at most/i);
    expect(() =>
      validateTaggingRule({
        ...base,
        tagIds: Array.from(
          { length: 26 },
          (_, index) => `018f2c1e-6d5b-7c3a-9f2e-${(100 + index).toString().padStart(12, "0")}`,
        ),
      }),
    ).toThrow(DomainError);
  });

  it("treats a missing field as no match", () => {
    const rule = base;
    expect(
      ruleMatches(rule, {
        accountId: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
        amountMinor: -100,
        currency: "EUR",
      }),
    ).toBe(false);
  });
});

const CHECKING = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
const SAVINGS = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e70";
const NOW = "2026-09-01T08:00:00.000Z";

/** The rule the user writes: no amount anywhere, only what each side looks like. */
const transferRule: TransferPairRule = {
  formatVersion: 3,
  kind: "transfer-pair",
  revision: 1,
  id: "018f2c1e-6d5b-7c3a-9f2e-9a2b3c4d5e99",
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
};

let legCounter = 0;
function leg(overrides: {
  accountId?: string;
  amountMinor?: number;
  bookingDate?: string;
  payee?: string;
  transfer?: boolean;
}): Transaction {
  legCounter += 1;
  const { transfer, ...rest } = overrides;
  return createTransaction(
    {
      accountId: overrides.accountId ?? CHECKING,
      bookingDate: overrides.bookingDate ?? "2026-09-28",
      amountMinor: overrides.amountMinor ?? -50000,
      currency: "EUR",
      ...(overrides.payee ? { payee: overrides.payee } : {}),
      ...(transfer === undefined ? {} : { transfer }),
      ...rest,
    },
    {
      id: `018f2c1e-6d5b-7c3a-9f2e-${String(legCounter).padStart(12, "0")}`,
      now: NOW,
    },
  );
}

/** The two legs of one 500 € transfer, as a bank reports them. */
function transferPair(): [Transaction, Transaction] {
  return [
    leg({ accountId: CHECKING, amountMinor: -50000, payee: "Savings account" }),
    leg({ accountId: SAVINGS, amountMinor: 50000, payee: "Everyday account" }),
  ];
}

describe("transfer rules", () => {
  it("validates the pair shape and refuses the tagging one", () => {
    expect(() => validateTaggingRule(transferRule)).not.toThrow();
    // Tags belong to tagging rules: a pair rule marks movements instead.
    expect(() => validateTaggingRule({ ...transferRule, tagIds: [CHECKING] })).toThrow(
      /assigns no tags/i,
    );
    expect(() =>
      validateTaggingRule({
        ...transferRule,
        conditions: [{ field: "payee", operator: "contains", value: "x" }],
      }),
    ).toThrow(/each side/i);
    expect(() =>
      validateTaggingRule({ ...transferRule, outgoing: undefined } as unknown as TaggingRule),
    ).toThrow(/both sides/i);
    expect(() =>
      validateTaggingRule({ ...transferRule, windowDays: undefined } as unknown as TaggingRule),
    ).toThrow(/day window/i);
    expect(() => validateTaggingRule({ ...transferRule, windowDays: 31 })).toThrow(/whole number/i);
  });

  it("matches two legs of the same amount, opposite signs, on two accounts", () => {
    const [outgoing, incoming] = transferPair();
    expect(transferPairMatches(transferRule, outgoing, incoming)).toBe(true);
    // The amounts are never written in the rule: another day, another amount.
    expect(
      transferPairMatches(
        transferRule,
        leg({ amountMinor: -1, payee: "Savings account" }),
        leg({ amountMinor: 1, accountId: SAVINGS, payee: "Everyday account" }),
      ),
    ).toBe(true);
  });

  it("refuses everything that is not one transfer", () => {
    const [outgoing, incoming] = transferPair();
    expect(transferPairMatches(transferRule, outgoing, incoming)).toBe(true);
    // Same account: money moved inside one ledger, not between two.
    expect(
      transferPairMatches(
        transferRule,
        outgoing,
        leg({ accountId: CHECKING, amountMinor: 50000, payee: "Everyday account" }),
      ),
    ).toBe(false);
    // Not the same amount, not the same currency, too far apart in time.
    expect(
      transferPairMatches(transferRule, outgoing, leg({ accountId: SAVINGS, amountMinor: 49000 })),
    ).toBe(false);
    expect(
      transferPairMatches(
        transferRule,
        outgoing,
        leg({ accountId: SAVINGS, amountMinor: 50000, payee: "Savings account" }),
      ),
    ).toBe(false);
    expect(
      transferPairMatches(
        transferRule,
        outgoing,
        leg({
          accountId: SAVINGS,
          amountMinor: 50000,
          bookingDate: "2026-10-05",
          payee: "Everyday account",
        }),
      ),
    ).toBe(false);
  });

  it("offers each pair once, and only for movements nobody decided on", () => {
    const [outgoing, incoming] = transferPair();
    // Two candidates for the same outgoing leg: one pair comes back, not two.
    const pairs = findTransferPairs([transferRule], [outgoing, incoming, { ...incoming }]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.outgoing.id).toBe(outgoing.id);
    expect(pairs[0]?.incoming.id).toBe(incoming.id);

    // A "no" from the user kills the pair, and a "yes" is not theirs to give.
    expect(findTransferPairs([transferRule], [{ ...outgoing, transfer: false }, incoming])).toEqual(
      [],
    );
    expect(findTransferPairs([transferRule], [outgoing, { ...incoming, transfer: true }])).toEqual(
      [],
    );
    // A disabled rule offers nothing.
    expect(findTransferPairs([{ ...transferRule, enabled: false }], [outgoing, incoming])).toEqual(
      [],
    );
  });

  it("upgrades a stored v2 rule into the tagging kind it already was", () => {
    const stored = {
      formatVersion: 2,
      revision: 1,
      id: "018f2c1e-6d5b-7c3a-9f2e-9a2b3c4d5e98",
      name: "Coffee",
      enabled: true,
      combinator: "and",
      conditions: [{ field: "userNote", operator: "contains", value: "espresso" }],
      tagIds: ["018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081"],
      createdAt: NOW,
      updatedAt: NOW,
    };
    const upgraded = upgradeTaggingRule(stored);
    expect(upgraded?.formatVersion).toBe(3);
    expect(upgraded?.kind).toBe("match");
    expect(upgraded?.conditions).toEqual(stored.conditions);
    expect(() => validateTaggingRule(upgraded as TaggingRule)).not.toThrow();
  });
});
