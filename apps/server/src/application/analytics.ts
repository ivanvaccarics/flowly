import { systemClock, type Clock } from "../domain/clock.js";
import { formatMinorToAmount } from "../domain/money.js";
import type { Tag } from "../domain/tag.js";
import type { Transaction } from "../domain/transaction.js";
import type { Vault } from "../vault/vault.js";
import { cacheFor } from "./aggregate-cache.js";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** `2026-02` → 28/29, so a monthly bucket covers its whole month. */
export function monthEnd(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

function daysInMonth(month: string): number {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

/**
 * Reads a `YYYY-MM,YYYY-MM` query value into a sorted, deduplicated list.
 * Returns `undefined` when a value is not a month, so the caller can answer 400
 * instead of silently ignoring the filter.
 */
export function parseMonthKeys(value: unknown): string[] | undefined {
  if (typeof value !== "string" || value.trim() === "") return [];
  const months = value.split(",").map((month) => month.trim());
  if (months.some((month) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))) return undefined;
  return [...new Set(months)].sort();
}

export interface DateRange {
  from: string;
  to: string;
}

/**
 * What the dashboard is scoped to: a range, plus an optional set of calendar
 * months and an optional set of tags. Empty sets mean "no extra narrowing".
 */
export interface DashboardScope extends DateRange {
  /** `YYYY-MM` months to include, so a scattered selection never pulls in the months between. */
  months?: readonly string[];
  /** Tag ids to include; a transaction matches when it carries at least one. */
  tagIds?: readonly string[];
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

export interface CashFlowBucket {
  currency: string;
  label: string;
  from: string;
  to: string;
  incomeMinor: number;
  expensesMinor: number;
}

export interface Dashboard {
  range: DateRange;
  generatedAt: string;
  balances: AccountBalance[];
  cashFlow: CurrencyTotals[];
  cashFlowBuckets: CashFlowBucket[];
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

  async dashboard(scope: DashboardScope): Promise<Dashboard> {
    const months = [...new Set(scope.months ?? [])].sort();
    const tagIds = [...new Set(scope.tagIds ?? [])].sort();
    const range: DateRange = { from: scope.from, to: scope.to };
    const cacheKey = `dashboard|${range.from}|${range.to}|${months.join(",")}|${tagIds.join(",")}`;
    return cacheFor(this.vault, this.clock).get(cacheKey, async () => {
      const inRange = await this.inRange(range);
      // The categories always describe the whole period, so the reader keeps
      // seeing every tag they could switch back on; the tag filter narrows the
      // flows, the chart and the totals instead.
      const inScope =
        months.length === 0
          ? inRange
          : inRange.filter((transaction) => months.includes(transaction.bookingDate.slice(0, 7)));
      const selected =
        tagIds.length === 0
          ? inScope
          : inScope.filter((transaction) =>
              transaction.tagIds.some((tagId) => tagIds.includes(tagId)),
            );
      const [balances, tagRecords] = await Promise.all([this.balances(), this.vault.tags.list()]);
      const cashFlow = this.flowOf(selected);
      const cashFlowBuckets = this.bucketsOf(selected, months, range);
      const spendingByTag = this.spendingOf(inScope, tagRecords);
      return {
        range,
        generatedAt: this.clock.nowIso(),
        balances,
        cashFlow,
        cashFlowBuckets,
        spendingByTag,
      };
    });
  }

  /**
   * One line per account and currency; never converts between currencies.
   *
   * A bank-linked account takes the balance Enable Banking reported at the last
   * sync, because that is what the bank says is really there. Every other
   * account keeps the figure this vault can compute: its opening balance plus
   * its booked movements, since pending rows are not money yet.
   */
  async balances(): Promise<AccountBalance[]> {
    const [accounts, transactions, bankAccounts] = await Promise.all([
      this.vault.accounts.list(),
      this.vault.transactions.list(),
      this.vault.bankAccounts.list(),
    ]);

    const reported = new Map<string, { minor: number; currency: string }>();
    for (const link of bankAccounts) {
      if (link.status !== "mapped" || !link.accountId) continue;
      if (link.lastBalanceMinor === undefined || !link.lastBalanceCurrency) continue;
      reported.set(link.accountId, {
        minor: link.lastBalanceMinor,
        currency: link.lastBalanceCurrency,
      });
    }

    const lines = new Map<string, AccountBalance>();
    for (const account of accounts) {
      const bank = reported.get(account.id);
      const currency = bank?.currency ?? account.defaultCurrency;
      lines.set(`${account.id}|${currency}`, {
        accountId: account.id,
        accountName: account.name,
        currency,
        balanceMinor: bank ? bank.minor : (account.openingBalanceMinor ?? 0),
        isDefaultCurrency: currency === account.defaultCurrency,
        transactionCount: 0,
      });
    }

    for (const transaction of transactions) {
      if (transaction.status !== "booked") continue;
      const account = accounts.find((candidate) => candidate.id === transaction.accountId);
      const key = `${transaction.accountId}|${transaction.currency}`;
      const existing = lines.get(key);
      const bank = reported.get(transaction.accountId);
      if (existing) {
        existing.transactionCount += 1;
        // A reported balance is a snapshot that already includes these
        // movements, so it is never summed again on top of them.
        if (bank?.currency !== transaction.currency) {
          existing.balanceMinor += transaction.amountMinor;
        }
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
    return this.flowOf(await this.inRange(range));
  }

  private flowOf(transactions: readonly Transaction[]): CurrencyTotals[] {
    const totals = new Map<string, CurrencyTotals>();
    for (const transaction of transactions) {
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
  /** Income and expenses per week, per currency, for the chart. */
  async cashFlowBuckets(range: DateRange, bucketDays = 7): Promise<CashFlowBucket[]> {
    return this.weeklyBuckets(await this.inRange(range), range, bucketDays);
  }

  private weeklyBuckets(
    transactions: readonly Transaction[],
    range: DateRange,
    bucketDays = 7,
  ): CashFlowBucket[] {
    const buckets = new Map<string, CashFlowBucket>();
    const start = new Date(`${range.from}T00:00:00.000Z`);
    const end = new Date(`${range.to}T00:00:00.000Z`);

    for (const transaction of transactions) {
      if (transaction.status !== "booked") continue;
      const booking = new Date(`${transaction.bookingDate}T00:00:00.000Z`);
      const index = Math.floor((booking.getTime() - start.getTime()) / (bucketDays * 86_400_000));
      const bucketStart = new Date(start.getTime() + index * bucketDays * 86_400_000);
      const bucketEnd = new Date(
        Math.min(bucketStart.getTime() + (bucketDays - 1) * 86_400_000, end.getTime()),
      );
      const key = `${transaction.currency}|${index}`;
      const entry = buckets.get(key) ?? {
        currency: transaction.currency,
        label: `Week ${index + 1}`,
        from: bucketStart.toISOString().slice(0, 10),
        to: bucketEnd.toISOString().slice(0, 10),
        incomeMinor: 0,
        expensesMinor: 0,
      };
      if (transaction.amountMinor >= 0) entry.incomeMinor += transaction.amountMinor;
      else entry.expensesMinor += -transaction.amountMinor;
      buckets.set(key, entry);
    }

    return [...buckets.values()].sort((a, b) =>
      a.currency === b.currency
        ? a.from.localeCompare(b.from)
        : a.currency.localeCompare(b.currency),
    );
  }

  private bucketsOf(
    transactions: readonly Transaction[],
    months: readonly string[],
    range: DateRange,
  ): CashFlowBucket[] {
    return months.length === 0
      ? this.weeklyBuckets(transactions, range)
      : this.monthlyBuckets(transactions, months);
  }

  /**
   * One bucket per selected month, per currency, so the chart keeps a
   * continuous axis even where a month holds nothing — and never invents a
   * figure for a month nobody selected.
   */
  private monthlyBuckets(
    transactions: readonly Transaction[],
    months: readonly string[],
  ): CashFlowBucket[] {
    const totals = new Map<string, { incomeMinor: number; expensesMinor: number }>();
    const currencies = new Set<string>();
    for (const transaction of transactions) {
      if (transaction.status !== "booked") continue;
      currencies.add(transaction.currency);
      const key = `${transaction.currency}|${transaction.bookingDate.slice(0, 7)}`;
      const entry = totals.get(key) ?? { incomeMinor: 0, expensesMinor: 0 };
      if (transaction.amountMinor >= 0) entry.incomeMinor += transaction.amountMinor;
      else entry.expensesMinor += -transaction.amountMinor;
      totals.set(key, entry);
    }

    const buckets: CashFlowBucket[] = [];
    for (const currency of [...currencies].sort()) {
      for (const month of months) {
        const entry = totals.get(`${currency}|${month}`) ?? { incomeMinor: 0, expensesMinor: 0 };
        buckets.push({
          currency,
          label: `${MONTH_LABELS[Number(month.slice(5, 7)) - 1] ?? month} ${month.slice(0, 4)}`,
          from: `${month}-01`,
          to: `${month}-${String(daysInMonth(month)).padStart(2, "0")}`,
          incomeMinor: entry.incomeMinor,
          expensesMinor: entry.expensesMinor,
        });
      }
    }
    return buckets;
  }

  async spendingByTag(range: DateRange): Promise<TagSpending[]> {
    const [tags, transactions] = await Promise.all([this.vault.tags.list(), this.inRange(range)]);
    return this.spendingOf(transactions, tags);
  }

  private spendingOf(
    transactions: readonly Transaction[],
    tags: readonly Tag[] = [],
  ): TagSpending[] {
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
