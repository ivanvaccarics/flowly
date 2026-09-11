import { DomainError } from "./errors.js";
import type { Transaction } from "./transaction.js";
import {
  assertIsoDateTime,
  assertText,
  assertUuid,
  assertUuidList,
  normalizeText,
} from "./values.js";

export const MAX_CONDITIONS_PER_RULE = 25;
export const MAX_TAGS_PER_RULE = 25;
export const RULE_NAME_MAX = 80;

export type RuleConditionField = "userNote" | "description" | "payee" | "amountMinor" | "accountId";
export type RuleConditionOperator = "contains" | "is" | "greaterThan" | "lessThan" | "equals";

export interface RuleCondition {
  field: RuleConditionField;
  operator: RuleConditionOperator;
  value: string | number;
  currency?: string;
}

export interface TaggingRule {
  formatVersion: 1;
  id: string;
  name: string;
  enabled: boolean;
  combinator: "and" | "or";
  conditions: RuleCondition[];
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

export const OPERATORS_BY_FIELD: Readonly<
  Record<RuleConditionField, readonly RuleConditionOperator[]>
> = {
  userNote: ["contains"],
  description: ["contains"],
  payee: ["is", "contains"],
  amountMinor: ["greaterThan", "lessThan", "equals"],
  accountId: ["is"],
};

export function validateTaggingRule(rule: TaggingRule): void {
  if (rule.formatVersion !== 1) {
    throw new DomainError("invalid-tagging-rule", "rule formatVersion must be 1", {
      formatVersion: rule.formatVersion,
    });
  }
  assertUuid(rule.id, "rule.id");
  assertText(rule.name, "rule.name", { max: RULE_NAME_MAX });
  if (typeof rule.enabled !== "boolean") {
    throw new DomainError("invalid-tagging-rule", "rule.enabled must be a boolean");
  }
  if (rule.combinator !== "and" && rule.combinator !== "or") {
    throw new DomainError("invalid-tagging-rule", "rule.combinator must be and or or", {
      combinator: rule.combinator,
    });
  }
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
    throw new DomainError("invalid-tagging-rule", "a rule needs at least one condition");
  }
  if (rule.conditions.length > MAX_CONDITIONS_PER_RULE) {
    throw new DomainError(
      "invalid-tagging-rule",
      `a rule accepts at most ${MAX_CONDITIONS_PER_RULE} conditions`,
    );
  }
  for (const condition of rule.conditions) {
    validateCondition(condition);
  }
  if (!Array.isArray(rule.tagIds) || rule.tagIds.length === 0) {
    throw new DomainError("invalid-tagging-rule", "a rule must assign at least one tag");
  }
  if (rule.tagIds.length > MAX_TAGS_PER_RULE) {
    throw new DomainError(
      "invalid-tagging-rule",
      `a rule assigns at most ${MAX_TAGS_PER_RULE} tags`,
    );
  }
  assertUuidList(rule.tagIds, "rule.tagIds", MAX_TAGS_PER_RULE);
  assertIsoDateTime(rule.createdAt, "rule.createdAt");
  assertIsoDateTime(rule.updatedAt, "rule.updatedAt");
}

function validateCondition(condition: RuleCondition): void {
  const operators = OPERATORS_BY_FIELD[condition.field];
  if (!operators) {
    throw new DomainError(
      "invalid-tagging-rule",
      `unsupported condition field: ${condition.field}`,
      {
        field: condition.field,
      },
    );
  }
  if (!operators.includes(condition.operator)) {
    throw new DomainError(
      "invalid-tagging-rule",
      `operator ${condition.operator} is not valid for ${condition.field}`,
      { field: condition.field, operator: condition.operator },
    );
  }
  const expectsNumber = condition.field === "amountMinor";
  if (expectsNumber) {
    if (typeof condition.value !== "number" || !Number.isSafeInteger(condition.value)) {
      throw new DomainError("invalid-tagging-rule", "amount conditions need an integer value", {
        value: condition.value,
      });
    }
    if (!condition.currency) {
      throw new DomainError("invalid-tagging-rule", "amount conditions need a currency", {});
    }
  } else if (typeof condition.value !== "string" || condition.value.trim() === "") {
    throw new DomainError("invalid-tagging-rule", "text conditions need a non-empty value", {
      field: condition.field,
    });
  }
  if (!expectsNumber && condition.currency !== undefined) {
    throw new DomainError("invalid-tagging-rule", "only amount conditions carry a currency", {
      field: condition.field,
    });
  }
  if (condition.field === "accountId") {
    assertUuid(condition.value, "condition.value");
  }
}

/** Only the fields the rule engine needs; keeps evaluation independent of storage. */
export interface RuleTarget {
  accountId: string;
  amountMinor: number;
  currency: string;
  payee?: string;
  description?: string;
  userNote?: string;
}

export function ruleMatches(rule: TaggingRule, target: RuleTarget | Transaction): boolean {
  if (!rule.enabled) return false;
  const matches = rule.conditions.map((condition) => conditionMatches(condition, target));
  return rule.combinator === "and" ? matches.every(Boolean) : matches.some(Boolean);
}

function conditionMatches(condition: RuleCondition, target: RuleTarget | Transaction): boolean {
  switch (condition.field) {
    case "userNote": {
      return textMatches(target.userNote, condition, "contains");
    }
    case "description": {
      return textMatches(target.description, condition, "contains");
    }
    case "payee": {
      return textMatches(target.payee, condition, condition.operator === "is" ? "is" : "contains");
    }
    case "accountId": {
      return target.accountId === condition.value;
    }
    case "amountMinor": {
      if (condition.currency !== target.currency) return false;
      const value = condition.value as number;
      if (condition.operator === "greaterThan") return target.amountMinor > value;
      if (condition.operator === "lessThan") return target.amountMinor < value;
      return target.amountMinor === value;
    }
    default:
      return false;
  }
}

function textMatches(
  raw: string | undefined,
  condition: RuleCondition,
  mode: "contains" | "is",
): boolean {
  if (raw === undefined) return false;
  const haystack = normalizeText(raw);
  const needle = normalizeText(String(condition.value));
  if (needle === "") return false;
  return mode === "is" ? haystack === needle : haystack.includes(needle);
}

/**
 * Evaluates every enabled rule in order and returns the union of their tags.
 * The result is a set: rule order only decides the order of new tags.
 */
export function evaluateTaggingRules(
  rules: readonly TaggingRule[],
  target: RuleTarget | Transaction,
): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    if (!ruleMatches(rule, target)) continue;
    for (const tagId of rule.tagIds) {
      if (seen.has(tagId)) continue;
      seen.add(tagId);
      tags.push(tagId);
    }
  }
  return tags;
}
