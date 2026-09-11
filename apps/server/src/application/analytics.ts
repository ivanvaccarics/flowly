import { systemClock, type Clock } from "../domain/clock.js";
import { formatMinorToAmount } from "../domain/money.js";
import type { Tag } from "../domain/tag.js";
import type { Transaction } from "../domain/transaction.js";
import type { Vault } from "../vault/vault.js";
import { cacheFor } from "./aggregate-cache.js";

export interface DateRange {
  from: string;
  to: string;
}

export interface CurrencyTotals {
  currency: string;
  incomeMinor: number;
  expensesMinor: number;
  netMinor: number;
  transactionCount: number;
}

export interface AccountBalance {
  accountId: string;
  accountName: string;
  currency: string;
  balanceMinor: number;
  isDefaultCurrency: boolean;
  transactionCount: number;
}

export interface TagSpending {
  tagId: string;
  tagName: string;
  currency: string;
  spentMinor: number;
  transactionCount: number;
}

export interface Dashboard {
  range: DateRange;
  generatedAt: string;
  balances: AccountBalance[];
  cashFlow: CurrencyTotals[];
  spendingByTag: TagSpending[];
}

/**
 * Dashboard aggregates: balances, cash flow and spending by tag.
 *
 * Everything is computed from signed minor units and ISO calendar dates, so
 * results do not depend on the server locale or time zone. Currencies are never
 * blended: a total always carries its currency code.
 */
export class AnalyticsService {
  private readonly vault: Vault;
  private readonly clock: Clock;

  constructor(vault: Vault, clock: Clock = systemClock) {
    this.vault = vault;
    this.clock = clock;
  }

  async dashboard(range: DateRange): Promise<Dashboard> {
    return cacheFor(this.vault, this.clock).get(`dashboard|${range.from}|${range.to}`, async () => {
      const [balances, cashFlow, spendingByTag] = await Promise.all([
        this.balances(),
        this.cashFlow(range),
        this.spendingByTag(range),
      ]);
      return { range, generatedAt: this.clock.nowIso(), balances, cashFlow, spendingByTag };
    });
  }

  /**
   * One line per account and currency; never converts between currencies.
   * Only booked transactions move a balance: pending rows are not money yet.
   */
  async balances(): Promise<AccountBalance[]> {
    const [accounts, transactions] = await Promise.all([
      this.vault.accounts.list(),
      this.vault.transactions.list(),
    ]);

    const lines = new Map<string, AccountBalance>();
    for (const account of accounts) {
      lines.set(`${account.id}|${account.defaultCurrency}`, {
        accountId: account.id,
        accountName: account.name,
        currency: account.defaultCurrency,
        balanceMinor: account.openingBalanceMinor ?? 0,
        isDefaultCurrency: true,
        transactionCount: 0,
      });
    }

    for (const transaction of transactions) {
      if (transaction.status !== "booked") continue;
      const account = accounts.find((candidate) => candidate.id === transaction.accountId);
      const key = `${transaction.accountId}|${transaction.currency}`;
      const existing = lines.get(key);
      if (existing) {
        existing.balanceMinor += transaction.amountMinor;
        existing.transactionCount += 1;
        continue;
      }
      lines.set(key, {
        accountId: transaction.accountId,
        accountName: account?.name ?? transaction.accountId,
        currency: transaction.currency,
        balanceMinor: transaction.amountMinor,
        isDefaultCurrency: account?.defaultCurrency === transaction.currency,
        transactionCount: 1,
      });
    }

    return [...lines.values()].sort((a, b) => {
      if (a.accountName !== b.accountName) return a.accountName < b.accountName ? -1 : 1;
      return a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0;
    });
  }

  /** Income, expenses and net per currency over a date range (booked only). */
  async cashFlow(range: DateRange): Promise<CurrencyTotals[]> {
    const totals = new Map<string, CurrencyTotals>();
    for (const transaction of await this.inRange(range)) {
      if (transaction.status !== "booked") continue;
      const entry = totals.get(transaction.currency) ?? {
        currency: transaction.currency,
        incomeMinor: 0,
        expensesMinor: 0,
        netMinor: 0,
        transactionCount: 0,
      };
      if (transaction.amountMinor >= 0) entry.incomeMinor += transaction.amountMinor;
      else entry.expensesMinor += -transaction.amountMinor;
      entry.netMinor += transaction.amountMinor;
      entry.transactionCount += 1;
      totals.set(transaction.currency, entry);
    }
    return [...totals.values()].sort((a, b) => (a.currency < b.currency ? -1 : 1));
  }

  /** Booked outflows grouped by tag and currency. */
  async spendingByTag(range: DateRange): Promise<TagSpending[]> {
    const [tags, transactions] = await Promise.all([this.vault.tags.list(), this.inRange(range)]);
    const names = new Map(tags.map((tag: Tag) => [tag.id, tag.name]));
    const totals = new Map<string, TagSpending>();

    for (const transaction of transactions) {
      if (transaction.status !== "booked" || transaction.amountMinor >= 0) continue;
      for (const tagId of transaction.tagIds) {
        const key = `${tagId}|${transaction.currency}`;
        const entry = totals.get(key) ?? {
          tagId,
          tagName: names.get(tagId) ?? tagId,
          currency: transaction.currency,
          spentMinor: 0,
          transactionCount: 0,
        };
        entry.spentMinor += -transaction.amountMinor;
        entry.transactionCount += 1;
        totals.set(key, entry);
      }
    }

    return [...totals.values()].sort((a, b) => {
      if (b.spentMinor !== a.spentMinor) return b.spentMinor - a.spentMinor;
      return a.tagName < b.tagName ? -1 : 1;
    });
  }

  /** Human-readable amounts for logs and UI previews; never locale formatted. */
  format(minor: number, currency: string): string {
    return formatMinorToAmount(minor, currency);
  }

  private async inRange(range: DateRange): Promise<Transaction[]> {
    return this.vault.transactions.list({ refBFrom: range.from, refBTo: range.to });
  }
}
