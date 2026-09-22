import { describe, expect, it } from "vitest";
import {
  MAX_CONDITIONS_PER_RULE,
  OPERATORS_BY_FIELD,
  evaluateTaggingRules,
  ruleMatches,
  validateTaggingRule,
  type RuleCondition,
  type TaggingRule,
} from "../src/domain/tagging-rule.js";
import { DomainError } from "../src/domain/errors.js";
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
    formatVersion: 1,
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
    formatVersion: 1,
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
        conditions: [{ field: "amount", operator: "greaterThan", value: 10.5 }],
      }),
    ).toThrow(/currency/i);
    expect(() =>
      validateTaggingRule({
        ...base,
        conditions: [{ field: "amount", operator: "greaterThan", value: 10.5, currency: "EUR" }],
      }),
    ).not.toThrow();
  });

  it("matches decimal amount rules against minor-unit transactions", () => {
    const rule = {
      ...base,
      conditions: [{ field: "amount", operator: "equals", value: -5.1, currency: "EUR" }],
    } satisfies TaggingRule;
    expect(ruleMatches(rule, { accountId: base.id, amountMinor: -510, currency: "EUR" })).toBe(true);
    expect(ruleMatches(rule, { accountId: base.id, amountMinor: -500, currency: "EUR" })).toBe(false);
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
