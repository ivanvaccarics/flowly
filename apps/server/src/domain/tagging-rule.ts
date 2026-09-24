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
/** How far apart the two legs of a transfer may sit, in days, by default. */
export const TRANSFER_WINDOW_DEFAULT_DAYS = 3;
export const TRANSFER_WINDOW_MAX_DAYS = 30;
/**
 * v1 stored amount conditions as `amountMinor`, a signed integer count of minor
 * units. v2 calls the field `amount` and writes the condition's currency as a
 * decimal string (`-5.10`), which the engine parses into exact minor units.
 * v3 adds the rule's `kind`: a `match` rule tags one movement at a time, while
 * a `transfer-pair` rule recognises the two legs of one transfer between own
 * accounts and marks them (docs/adr/0040). A v2 rule upgrades to a `match` rule
 * with everything else untouched.
 */
export const TAGGING_RULE_FORMAT_VERSION = 3;

export type RuleConditionField =
  "userNote" | "description" | "payee" | "counterpartyIban" | "amount" | "accountId";
export type RuleConditionOperator = "contains" | "is" | "greaterThan" | "lessThan" | "equals";

/**
 * What a rule decides. `match` reads one movement and adds tags; `transfer-pair`
 * reads two movements that belong together and marks them as a transfer.
 */
export type TaggingRuleKind = "match" | "transfer-pair";

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
  kind: TaggingRuleKind;
  /** `match` rules only. */
  combinator?: "and" | "or";
  /** `match` rules only. */
  conditions?: RuleCondition[];
  /** `match` rules assign at least one; a transfer rule assigns none. */
  tagIds: string[];
  /** `transfer-pair` rules only: the side that leaves an account. */
  outgoing?: RuleConditionSet;
  /** `transfer-pair` rules only: the side that arrives on another account. */
  incoming?: RuleConditionSet;
  /** `transfer-pair` rules only: how many days apart the two legs may book. */
  windowDays?: number;
  createdAt: string;
  updatedAt: string;
}

export type MatchRule = TaggingRule & {
  kind: "match";
  combinator: "and" | "or";
  conditions: RuleCondition[];
};

export type TransferPairRule = TaggingRule & {
  kind: "transfer-pair";
  outgoing: RuleConditionSet;
  incoming: RuleConditionSet;
  windowDays: number;
};

export function isMatchRule(rule: TaggingRule): rule is MatchRule {
  return rule.kind === "match";
}

export function isTransferPairRule(rule: TaggingRule): rule is TransferPairRule {
  return rule.kind === "transfer-pair";
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
  counterpartyIban: ["is", "contains"],
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
  if (rule.kind !== "match" && rule.kind !== "transfer-pair") {
    throw new DomainError("invalid-tagging-rule", `unsupported rule kind: ${rule.kind}`, {
      kind: rule.kind,
    });
  }
  if (!Array.isArray(rule.tagIds)) {
    throw new DomainError("invalid-tagging-rule", "rule.tagIds must be an array");
  }
  if (rule.tagIds.length > MAX_TAGS_PER_RULE) {
    throw new DomainError(
      "invalid-tagging-rule",
      `a rule assigns at most ${MAX_TAGS_PER_RULE} tags`,
    );
  }
  assertUuidList(rule.tagIds, "rule.tagIds", MAX_TAGS_PER_RULE);
  if (isMatchRule(rule)) {
    if (rule.tagIds.length === 0) {
      throw new DomainError("invalid-tagging-rule", "a rule must assign at least one tag");
    }
    validateConditionSet(rule);
  } else {
    if (rule.tagIds.length > 0) {
      throw new DomainError(
        "invalid-tagging-rule",
        "a transfer rule marks movements, so it assigns no tags",
      );
    }
    if (rule.combinator !== undefined || rule.conditions !== undefined) {
      throw new DomainError(
        "invalid-tagging-rule",
        "a transfer rule keeps its conditions on each side, not on the rule",
      );
    }
    if (rule.outgoing === undefined || rule.incoming === undefined) {
      throw new DomainError(
        "invalid-tagging-rule",
        "a transfer rule needs the conditions of both sides",
      );
    }
    validateConditionSet(rule.outgoing);
    validateConditionSet(rule.incoming);
    const window = rule.windowDays;
    if (window === undefined) {
      throw new DomainError("invalid-tagging-rule", "a transfer rule needs a day window");
    }
    if (!Number.isSafeInteger(window) || window < 0 || window > TRANSFER_WINDOW_MAX_DAYS) {
      throw new DomainError(
        "invalid-tagging-rule",
        `rule.windowDays must be a whole number of days from 0 to ${TRANSFER_WINDOW_MAX_DAYS}`,
        { windowDays: window },
      );
    }
  }
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
  counterpartyIban?: string;
}

export function ruleMatches(rule: TaggingRule, target: RuleTarget | Transaction): boolean {
  // A transfer rule reads two movements, so on its own it matches nothing here.
  if (!rule.enabled || !isMatchRule(rule)) return false;
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
    case "counterpartyIban": {
      // IBANs are compared as the bank writes them: no spaces, one case, so a
      // value pasted from a statement or a bank portal still matches.
      const compact = (value: string | undefined) => value?.replace(/\s+/g, "").toUpperCase() ?? "";
      const haystack = compact(target.counterpartyIban);
      const needle = compact(String(condition.value));
      if (haystack === "" || needle === "") return false;
      return condition.operator === "is" ? haystack === needle : haystack.includes(needle);
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

/** The two legs of one transfer, as a rule reads them. */
export interface TransactionPair {
  outgoing: Transaction;
  incoming: Transaction;
}

/**
 * True when these two movements are the two legs of one transfer as the rule
 * describes it.
 *
 * The sign decides the side: the negative leg is the outgoing one, the positive
 * leg the incoming one, so a rule never has to say which is which. On top of
 * that the two legs share a currency, carry exactly opposite amounts, sit on two
 * different accounts and book close enough in time, each matching its own side.
 * The amounts are never written into the rule: the point is that one account has
 * N and the other -N, whatever N is that day.
 */
export function transferPairMatches(
  rule: TransferPairRule,
  outgoing: Transaction,
  incoming: Transaction,
): boolean {
  if (!rule.enabled) return false;
  if (outgoing.currency !== incoming.currency) return false;
  if (outgoing.amountMinor >= 0 || incoming.amountMinor <= 0) return false;
  if (outgoing.amountMinor !== -incoming.amountMinor) return false;
  if (outgoing.accountId === incoming.accountId) return false;
  if (daysBetween(outgoing.bookingDate, incoming.bookingDate) > rule.windowDays) return false;
  return (
    conditionSetMatches(rule.outgoing, outgoing) && conditionSetMatches(rule.incoming, incoming)
  );
}

/**
 * The pairs the enabled transfer rules offer, with one movement in at most one
 * pair.
 *
 * Only undecided movements take part: a `true` or `false` already stored is the
 * user's answer, and both legs of a pair have to be undecided for the pair to be
 * theirs to give. Rows are walked by date and id, so the same vault always
 * offers the same pairs.
 */
export function findTransferPairs(
  rules: readonly TaggingRule[],
  transactions: readonly Transaction[],
): TransactionPair[] {
  const pairRules = rules.filter(isTransferPairRule).filter((rule) => rule.enabled);
  if (pairRules.length === 0) return [];

  const undecided = transactions.filter((transaction) => transaction.transfer === undefined);
  const incomingByAmount = new Map<string, Transaction[]>();
  for (const transaction of undecided) {
    if (transaction.amountMinor <= 0) continue;
    const key = `${transaction.currency}|${transaction.amountMinor}`;
    const bucket = incomingByAmount.get(key);
    if (bucket) bucket.push(transaction);
    else incomingByAmount.set(key, [transaction]);
  }
  for (const bucket of incomingByAmount.values()) bucket.sort(byBookingThenId);

  const claimed = new Set<string>();
  const pairs: TransactionPair[] = [];
  const outgoingLegs = undecided
    .filter((transaction) => transaction.amountMinor < 0)
    .sort(byBookingThenId);
  for (const outgoing of outgoingLegs) {
    if (claimed.has(outgoing.id)) continue;
    const bucket = incomingByAmount.get(`${outgoing.currency}|${-outgoing.amountMinor}`);
    if (!bucket) continue;
    const incoming = bucket.find(
      (candidate) =>
        !claimed.has(candidate.id) &&
        candidate.accountId !== outgoing.accountId &&
        pairRules.some((rule) => transferPairMatches(rule, outgoing, candidate)),
    );
    if (!incoming) continue;
    claimed.add(outgoing.id);
    claimed.add(incoming.id);
    pairs.push({ outgoing, incoming });
  }
  return pairs;
}

function byBookingThenId(left: Transaction, right: Transaction): number {
  return left.bookingDate.localeCompare(right.bookingDate) || left.id.localeCompare(right.id);
}

/** Whole days between two ISO calendar dates, independent of the time zone. */
function daysBetween(from: string, to: string): number {
  const millis = Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`);
  return Math.round(Math.abs(millis) / 86_400_000);
}

/**
 * Rewrites a stored rule into the current format. A v1 rule also moves its
 * condition field from `amountMinor` to `amount`, and its value from signed minor
 * units (`-510`) to the condition's currency (`-5.10`), so the money is the same.
 * A v2 rule only gains the kind it already behaves like. Returns undefined when
 * there is nothing to upgrade or a legacy amount cannot be converted, so a vault
 * with an odd record still opens.
 */
export function upgradeTaggingRule(raw: unknown): TaggingRule | undefined {
  if (!isRecord(raw)) return undefined;
  const version = raw["formatVersion"];
  if (version !== 1 && version !== 2) return undefined;
  const upgraded: Record<string, unknown> = {
    ...raw,
    formatVersion: TAGGING_RULE_FORMAT_VERSION,
    kind: "match",
  };
  if (version === 2) return upgraded as unknown as TaggingRule;
  const rawConditions = raw["conditions"];
  if (!Array.isArray(rawConditions)) return undefined;
  const conditions: RuleCondition[] = [];
  for (const rawCondition of rawConditions) {
    const condition = upgradeCondition(rawCondition);
    if (!condition) return undefined;
    conditions.push(condition);
  }
  return { ...upgraded, conditions } as unknown as TaggingRule;
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
