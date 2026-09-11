import type { Clock } from "../domain/clock.js";
import type { TaggingRule } from "../domain/tagging-rule.js";
import { evaluateTaggingRules } from "../domain/tagging-rule.js";
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
  changed: number;
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
    return { evaluated: transactions.length, changed };
  }

  nowIso(): string {
    return this.clock.nowIso();
  }
}
