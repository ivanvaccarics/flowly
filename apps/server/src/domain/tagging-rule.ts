import { DomainError } from "./errors.js";
import { formatMinorToAmount, parseAmountToMinor } from "./money.js";
import type { Transaction } from "./transaction.js";
import {
  assertIsoDateTime,
  assertRevision,
  assertText,
  assertUuid,
  assertUuidList,
  normalizeText,
} from "./values.js";

export const MAX_CONDITIONS_PER_RULE = 25;
export const MAX_TAGS_PER_RULE = 25;
export const RULE_NAME_MAX = 80;
/**
 * v1 stored amount conditions as `amountMinor`, a signed integer count of minor
 * units. v2 calls the field `amount` and writes the condition's currency as a
 * decimal string (`-5.10`), which the engine parses into exact minor units.
 */
export const TAGGING_RULE_FORMAT_VERSION = 2;

export type RuleConditionField = "userNote" | "description" | "payee" | "amount" | "accountId";
export type RuleConditionOperator = "contains" | "is" | "greaterThan" | "lessThan" | "equals";

export interface RuleCondition {
  field: RuleConditionField;
  operator: RuleConditionOperator;
  value: string | number;
  currency?: string;
}

export interface TaggingRule {
  formatVersion: typeof TAGGING_RULE_FORMAT_VERSION;
  revision: number;
  id: string;
  name: string;
  enabled: boolean;
  combinator: "and" | "or";
  conditions: RuleCondition[];
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * The matching half of a rule, without its identity: what the engine runs and
 * what the composer previews before anything is saved.
 */
export interface RuleConditionSet {
  combinator: "and" | "or";
  conditions: RuleCondition[];
}

export const OPERATORS_BY_FIELD: Readonly<
  Record<RuleConditionField, readonly RuleConditionOperator[]>
> = {
  userNote: ["contains"],
  description: ["contains"],
  payee: ["is", "contains"],
  amount: ["greaterThan", "lessThan", "equals"],
  accountId: ["is"],
};

export function validateTaggingRule(rule: TaggingRule): void {
  if (rule.formatVersion !== TAGGING_RULE_FORMAT_VERSION) {
    throw new DomainError(
      "invalid-tagging-rule",
      `rule formatVersion must be ${TAGGING_RULE_FORMAT_VERSION}`,
      { formatVersion: rule.formatVersion },
    );
  }
  assertRevision(rule.revision, "rule.revision");
  assertUuid(rule.id, "rule.id");
  assertText(rule.name, "rule.name", { max: RULE_NAME_MAX });
  if (typeof rule.enabled !== "boolean") {
    throw new DomainError("invalid-tagging-rule", "rule.enabled must be a boolean");
  }
  validateConditionSet(rule);
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

/** Validates the matching core on its own, so a draft can be checked unsaved. */
export function validateConditionSet(core: RuleConditionSet): void {
  if (core.combinator !== "and" && core.combinator !== "or") {
    throw new DomainError("invalid-tagging-rule", "rule.combinator must be and or or", {
      combinator: core.combinator,
    });
  }
  if (!Array.isArray(core.conditions) || core.conditions.length === 0) {
    throw new DomainError("invalid-tagging-rule", "a rule needs at least one condition");
  }
  if (core.conditions.length > MAX_CONDITIONS_PER_RULE) {
    throw new DomainError(
      "invalid-tagging-rule",
      `a rule accepts at most ${MAX_CONDITIONS_PER_RULE} conditions`,
    );
  }
  for (const condition of core.conditions) {
    validateCondition(condition);
  }
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
  const expectsNumber = condition.field === "amount";
  if (expectsNumber) {
    if (typeof condition.value !== "string" || condition.value.trim() === "") {
      throw new DomainError(
        "invalid-tagging-rule",
        "amount conditions need the amount as a decimal string, like -5.10",
        { value: condition.value },
      );
    }
    if (!condition.currency) {
      throw new DomainError("invalid-tagging-rule", "amount conditions need a currency", {});
    }
    // Rejects an unsupported currency and amounts it cannot hold exactly.
    parseAmountToMinor(condition.value, condition.currency);
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
  return conditionSetMatches(rule, target);
}

/**
 * Matches conditions with no rule identity involved. The engine and the
 * composer's preview share this, so a preview can never disagree with what
 * saving the rule would do.
 */
export function conditionSetMatches(
  core: { combinator: "and" | "or"; conditions: readonly RuleCondition[] },
  target: RuleTarget | Transaction,
): boolean {
  if (core.conditions.length === 0) return false;
  const matches = core.conditions.map((condition) => conditionMatches(condition, target));
  return core.combinator === "and" ? matches.every(Boolean) : matches.some(Boolean);
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
    case "amount": {
      if (condition.currency !== target.currency) return false;
      const value = parseAmountToMinor(condition.value as string, target.currency);
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

/**
 * Rewrites a stored v1 rule into the current format: the condition field moves
 * from `amountMinor` to `amount`, and its value from signed minor units
 * (`-510`) to the condition's currency (`-5.10`), so the money is the same.
 * Returns undefined when there is nothing to upgrade or a legacy amount cannot
 * be converted, so a vault with an odd record still opens.
 */
export function upgradeTaggingRule(raw: unknown): TaggingRule | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw["formatVersion"] !== 1) return undefined;
  const rawConditions = raw["conditions"];
  if (!Array.isArray(rawConditions)) return undefined;
  const conditions: RuleCondition[] = [];
  for (const rawCondition of rawConditions) {
    const condition = upgradeCondition(rawCondition);
    if (!condition) return undefined;
    conditions.push(condition);
  }
  return {
    ...raw,
    formatVersion: TAGGING_RULE_FORMAT_VERSION,
    conditions,
  } as unknown as TaggingRule;
}

function upgradeCondition(raw: unknown): RuleCondition | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw["field"] !== "amountMinor") return raw as unknown as RuleCondition;
  const currency = raw["currency"];
  const minor = raw["value"];
  if (typeof currency !== "string" || typeof minor !== "number" || !Number.isSafeInteger(minor)) {
    return undefined;
  }
  let amount: string;
  try {
    amount = formatMinorToAmount(minor, currency);
  } catch {
    return undefined;
  }
  const rest: Record<string, unknown> = { ...raw };
  delete rest["field"];
  return { ...rest, field: "amount", value: amount } as RuleCondition;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
