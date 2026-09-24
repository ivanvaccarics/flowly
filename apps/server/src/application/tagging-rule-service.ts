import type { Clock } from "../domain/clock.js";
import type { RuleConditionSet, TaggingRule } from "../domain/tagging-rule.js";
import {
  conditionSetMatches,
  evaluateTaggingRules,
  findTransferPairs,
  isTransferPairRule,
  ruleMatches,
  validateConditionSet,
} from "../domain/tagging-rule.js";
import type { Transaction } from "../domain/transaction.js";
import { systemClock } from "../domain/clock.js";
import type { Vault } from "../vault/vault.js";

export interface BackfillScope {
  accountId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface BackfillReport {
  evaluated: number;
  /** Rows whose tags changed. */
  changed: number;
  /** Pairs of movements the transfer rules recognised as one transfer. */
  transferPairs: number;
}

/** How many stored transactions each rule and each applied tag would cover. */
export interface TaggingRuleStats {
  /** Transactions in the vault that the engine looked at. */
  evaluated: number;
  /** Transactions matched by at least one enabled rule. */
  matched: number;
  byRule: Array<{ ruleId: string; matches: number }>;
  byTag: Array<{ tagId: string; transactions: number }>;
}

export interface TaggingRulePreview {
  /** Transactions the preview looked at, newest first. */
  evaluated: number;
  matched: number;
}

/** How many recent transactions a preview reads by default. */
export const PREVIEW_LIMIT = 100;

/** Calendar-day arithmetic on ISO dates, independent of the local time zone. */
function shiftDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Applies user-authored tagging rules. Rules only add tags, so the operation is
 * idempotent and safe to repeat over existing transactions.
 */
export class TaggingRuleService {
  private readonly vault: Vault;
  private readonly clock: Clock;

  constructor(vault: Vault, clock: Clock = systemClock) {
    this.vault = vault;
    this.clock = clock;
  }

  async rules(): Promise<TaggingRule[]> {
    return this.vault.taggingRules.list();
  }

  tagsFor(transaction: Transaction, rules: readonly TaggingRule[]): string[] {
    return evaluateTaggingRules(rules, transaction);
  }

  /** Adds every matching rule tag to the transaction; returns the union. */
  withRuleTags(
    transaction: Transaction,
    rules: readonly TaggingRule[],
  ): {
    transaction: Transaction;
    addedTagIds: string[];
  } {
    const matched = this.tagsFor(transaction, rules);
    const existing = new Set(transaction.tagIds);
    const addedTagIds = matched.filter((tagId) => !existing.has(tagId));
    if (addedTagIds.length === 0) return { transaction, addedTagIds: [] };
    return {
      transaction: { ...transaction, tagIds: [...transaction.tagIds, ...addedTagIds] },
      addedTagIds,
    };
  }

  /** Creates a transaction inside a transaction block, applying rules first. */
  async createWithRules(transaction: Transaction): Promise<Transaction> {
    const rules = await this.rules();
    const { transaction: tagged } = this.withRuleTags(transaction, rules);
    return this.vault.transactions.create(tagged);
  }

  /** Explicit backfill over existing transactions; idempotent. */
  async backfill(scope: BackfillScope = {}): Promise<BackfillReport> {
    const [rules, transactions] = await Promise.all([
      this.rules(),
      this.vault.transactions.list(scope.accountId ? { refA: scope.accountId } : {}),
    ]);
    let changed = 0;
    await this.vault.transaction(async () => {
      for (const transaction of transactions) {
        if (scope.fromDate && transaction.bookingDate < scope.fromDate) continue;
        if (scope.toDate && transaction.bookingDate > scope.toDate) continue;
        const { transaction: tagged, addedTagIds } = this.withRuleTags(transaction, rules);
        if (addedTagIds.length === 0) continue;
        await this.vault.transactions.update(tagged, transaction.revision);
        changed += 1;
      }
    });
    const inScope = transactions.filter((transaction) => {
      if (scope.fromDate && transaction.bookingDate < scope.fromDate) return false;
      if (scope.toDate && transaction.bookingDate > scope.toDate) return false;
      return true;
    });
    const transferPairs = await this.markTransfers(inScope);
    return { evaluated: transactions.length, changed, transferPairs };
  }

  /**
   * Marks the transfers the pair rules recognise among the movements given and
   * the ones already stored near them.
   *
   * Only undecided movements take part, so a flag the user set is never
   * overturned, and one movement belongs to at most one pair. Returns how many
   * pairs were marked.
   */
  async markTransfers(transactions: readonly Transaction[]): Promise<number> {
    if (transactions.length === 0) return 0;
    const rules = await this.rules();
    const pairRules = rules.filter(isTransferPairRule).filter((rule) => rule.enabled);
    if (pairRules.length === 0) return 0;

    // The other leg can book up to the widest window away, so the vault is read
    // across that span and not only on the dates in hand: a movement imported
    // today often pairs with one that arrived in the previous sync.
    const window = Math.max(...pairRules.map((rule) => rule.windowDays));
    const dates = transactions.map((transaction) => transaction.bookingDate).sort();
    const stored = await this.vault.transactions.list({
      refBFrom: shiftDays(dates[0]!, -window),
      refBTo: shiftDays(dates[dates.length - 1]!, window),
    });
    const candidates = new Map<string, Transaction>();
    // The vault's copy wins where there is one: it carries the revision a write
    // needs, and a flag the user set between the import and this call.
    for (const transaction of transactions) candidates.set(transaction.id, transaction);
    for (const transaction of stored) candidates.set(transaction.id, transaction);

    const pairs = findTransferPairs(pairRules, [...candidates.values()]);
    if (pairs.length === 0) return 0;
    await this.vault.transaction(async () => {
      for (const pair of pairs) {
        for (const leg of [pair.outgoing, pair.incoming]) {
          await this.vault.transactions.update({ ...leg, transfer: true }, leg.revision);
        }
      }
    });
    return pairs.length;
  }

  nowIso(): string {
    return this.clock.nowIso();
  }

  /**
   * Reads the engine's own coverage: every transaction is evaluated once, and a
   * rule or a tag counts the transactions it would tag. Read-only, so asking
   * never changes the vault.
   */
  async stats(): Promise<TaggingRuleStats> {
    const [rules, transactions] = await Promise.all([this.rules(), this.vault.transactions.list()]);
    const matchesByRule = new Map(rules.map((rule) => [rule.id, 0]));
    const transactionsByTag = new Map<string, number>();
    const matchedIds = new Set<string>();
    for (const transaction of transactions) {
      const tags = new Set<string>();
      for (const rule of rules) {
        if (!ruleMatches(rule, transaction)) continue;
        matchesByRule.set(rule.id, (matchesByRule.get(rule.id) ?? 0) + 1);
        for (const tagId of rule.tagIds) tags.add(tagId);
      }
      if (tags.size === 0) continue;
      matchedIds.add(transaction.id);
      for (const tagId of tags) {
        transactionsByTag.set(tagId, (transactionsByTag.get(tagId) ?? 0) + 1);
      }
    }
    // A transfer rule covers two movements at a time, so it is counted on its
    // own: how many pairs it would mark across the vault, doubled into rows.
    for (const rule of rules) {
      if (!isTransferPairRule(rule)) continue;
      const pairs = findTransferPairs([rule], transactions);
      matchesByRule.set(rule.id, pairs.length * 2);
      for (const pair of pairs) {
        matchedIds.add(pair.outgoing.id);
        matchedIds.add(pair.incoming.id);
      }
    }
    return {
      evaluated: transactions.length,
      matched: matchedIds.size,
      byRule: rules.map((rule) => ({
        ruleId: rule.id,
        matches: matchesByRule.get(rule.id) ?? 0,
      })),
      byTag: [...transactionsByTag]
        .map(([tagId, transactions_]) => ({ tagId, transactions: transactions_ }))
        .sort((a, b) => b.transactions - a.transactions || a.tagId.localeCompare(b.tagId)),
    };
  }

  /**
   * Evaluates an unsaved condition set against the most recent transactions, so
   * the composer can say what a rule would do before it is saved.
   */
  async preview(core: RuleConditionSet, limit = PREVIEW_LIMIT): Promise<TaggingRulePreview> {
    validateConditionSet(core);
    const transactions = await this.vault.transactions.list();
    const recent = [...transactions]
      .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate) || a.id.localeCompare(b.id))
      .slice(0, Math.max(0, limit));
    const matched = recent.filter((transaction) => conditionSetMatches(core, transaction)).length;
    return { evaluated: recent.length, matched };
  }
}
