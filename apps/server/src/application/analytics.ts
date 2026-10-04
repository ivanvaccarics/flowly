import { systemClock, type Clock } from "../domain/clock.js";
import { currencyInfo, formatMinorToAmount } from "../domain/money.js";
import type { Tag } from "../domain/tag.js";
import type { Transaction, TransactionSource } from "../domain/transaction.js";
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

/** How much of the vault leans on a tag: movements that carry it, rules that apply it. */
export interface TagUsage {
  transactions: number;
  rules: number;
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

/** How the period's booked outflows add up, in the primary currency. */
export interface ExpenseTotals {
  spentMinor: number;
  incomeMinor: number;
  netMinor: number;
  transactionCount: number;
  /** Days of the period that belong to the selected months. */
  calendarDays: number;
  /** Selected days that carry at least one booked outflow. */
  activeDays: number;
  averageDailyMinor: number;
  averageActiveDayMinor: number;
  averageTicketMinor: number;
  largestMinor: number;
  largestDate: string | null;
  largestPayee: string | null;
}

export interface ExpenseCategory {
  tagId: string;
  tagName: string;
  spentMinor: number;
  transactionCount: number;
  averageMinor: number;
  largestMinor: number;
}

export interface ExpenseDay {
  date: string;
  selected: boolean;
  spentMinor: number;
  transactionCount: number;
}

export interface ExpenseWeek {
  label: string;
  from: string;
  to: string;
  spentMinor: number;
  transactionCount: number;
}

export interface ExpenseAccountLine {
  accountId: string;
  accountName: string;
  spentMinor: number;
  transactionCount: number;
}

export interface ExpenseSourceLine {
  source: TransactionSource;
  spentMinor: number;
  transactionCount: number;
}

export interface ExpenseBand {
  key: "under-10" | "10-50" | "50-150" | "150-500" | "over-500";
  label: string;
  lowerMinor: number;
  upperMinor: number | null;
  count: number;
  spentMinor: number;
}

/**
 * The expense detail view: the period's spending read many ways — by category,
 * by day, by week, by account, by source and by amount band — all in one
 * currency, so the figures can be compared without a conversion.
 */
export interface ExpenseDetails {
  range: DateRange;
  generatedAt: string;
  currency: string | null;
  otherCurrencies: string[];
  totals: ExpenseTotals;
  byCategory: ExpenseCategory[];
  untagged: { spentMinor: number; transactionCount: number };
  daily: ExpenseDay[];
  weekly: ExpenseWeek[];
  byAccount: ExpenseAccountLine[];
  bySource: ExpenseSourceLine[];
  amountBands: ExpenseBand[];
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
   * The expense detail view for one period. It reads the same scope as the
   * dashboard — a set of months, or the `from`/`to` range when the set is empty
   * — and narrows to the one currency the period leans on most, so every figure
   * it returns can be compared without a conversion. A day whose month the
   * caller left out carries no figure but still tells the heatmap it exists.
   */
  async expenseDetails(scope: DashboardScope): Promise<ExpenseDetails> {
    const months = [...new Set(scope.months ?? [])].sort();
    const tagIds = [...new Set(scope.tagIds ?? [])].sort();
    const range: DateRange = { from: scope.from, to: scope.to };
    const cacheKey = `details|${range.from}|${range.to}|${months.join(",")}|${tagIds.join(",")}`;
    return cacheFor(this.vault, this.clock).get(cacheKey, async () => {
      const inRange = await this.inRange(range);
      const inScope =
        months.length === 0
          ? inRange
          : inRange.filter((transaction) => months.includes(transaction.bookingDate.slice(0, 7)));
      const scoped =
        tagIds.length === 0
          ? inScope
          : inScope.filter((transaction) =>
              transaction.tagIds.some((tagId) => tagIds.includes(tagId)),
            );
      const outflows = scoped.filter(isBookedOutflow);
      const inflows = scoped.filter(isBookedInflow);

      // The currency the period spends most in carries every figure below;
      // the others are named instead of being converted into it.
      const spentByCurrency = new Map<string, number>();
      for (const transaction of outflows) {
        spentByCurrency.set(
          transaction.currency,
          (spentByCurrency.get(transaction.currency) ?? 0) + -transaction.amountMinor,
        );
      }
      const ranked = [...spentByCurrency.entries()].sort(
        (left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1),
      );
      const currency = ranked[0]?.[0] ?? null;
      const otherCurrencies = ranked
        .slice(1)
        .map(([code]) => code)
        .sort();
      const primaryOutflows = currency
        ? outflows.filter((transaction) => transaction.currency === currency)
        : [];
      const primaryInflows = currency
        ? inflows.filter((transaction) => transaction.currency === currency)
        : [];

      const [accounts, tagRecords] = await Promise.all([
        this.vault.accounts.list(),
        this.vault.tags.list(),
      ]);
      const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
      const tagNames = new Map(tagRecords.map((tag) => [tag.id, tag.name]));

      const days = daysOf(range).map((date) => ({
        date,
        selected: months.length === 0 || months.includes(date.slice(0, 7)),
      }));
      const byDay = new Map<string, { spentMinor: number; transactionCount: number }>();
      for (const transaction of primaryOutflows) {
        const entry = byDay.get(transaction.bookingDate) ?? {
          spentMinor: 0,
          transactionCount: 0,
        };
        entry.spentMinor += -transaction.amountMinor;
        entry.transactionCount += 1;
        byDay.set(transaction.bookingDate, entry);
      }

      const spentMinor = primaryOutflows.reduce((total, row) => total + -row.amountMinor, 0);
      const incomeMinor = primaryInflows.reduce((total, row) => total + row.amountMinor, 0);
      const transactionCount = primaryOutflows.length;
      const calendarDays = days.filter((day) => day.selected).length;
      const activeDays = days.filter(
        (day) => day.selected && (byDay.get(day.date)?.spentMinor ?? 0) > 0,
      ).length;
      const largest = primaryOutflows.reduce<Transaction | undefined>(
        (current, row) =>
          current === undefined || -row.amountMinor > -current.amountMinor ? row : current,
        undefined,
      );

      const daily: ExpenseDay[] = days.map((day) => {
        const entry = day.selected ? byDay.get(day.date) : undefined;
        return {
          date: day.date,
          selected: day.selected,
          spentMinor: entry?.spentMinor ?? 0,
          transactionCount: entry?.transactionCount ?? 0,
        };
      });

      const weekly: ExpenseWeek[] = [];
      for (let index = 0; index * 7 < days.length; index += 1) {
        const slice = days.slice(index * 7, index * 7 + 7);
        const first = slice[0]!.date;
        const last = slice[slice.length - 1]!.date;
        const spent = slice
          .filter((day) => day.selected)
          .reduce((total, day) => total + (byDay.get(day.date)?.spentMinor ?? 0), 0);
        const count = slice
          .filter((day) => day.selected)
          .reduce((total, day) => total + (byDay.get(day.date)?.transactionCount ?? 0), 0);
        weekly.push({
          label: `Week ${index + 1}`,
          from: first,
          to: last,
          spentMinor: spent,
          transactionCount: count,
        });
      }

      const byCategory = this.categoriesOf(primaryOutflows, tagNames);
      const byAccount = this.accountsOf(primaryOutflows, accountNames);
      const bySource = this.sourcesOf(primaryOutflows);
      const amountBands = amountBandsOf(primaryOutflows, currency ?? "EUR");
      const untaggedRows = primaryOutflows.filter((row) => row.tagIds.length === 0);

      return {
        range,
        generatedAt: this.clock.nowIso(),
        currency,
        otherCurrencies,
        totals: {
          spentMinor,
          incomeMinor,
          netMinor: incomeMinor - spentMinor,
          transactionCount,
          calendarDays,
          activeDays,
          averageDailyMinor: divide(spentMinor, calendarDays),
          averageActiveDayMinor: divide(spentMinor, activeDays),
          averageTicketMinor: divide(spentMinor, transactionCount),
          largestMinor: largest ? -largest.amountMinor : 0,
          largestDate: largest?.bookingDate ?? null,
          largestPayee: largest ? (largest.payee ?? largest.description ?? null) : null,
        },
        byCategory,
        untagged: {
          spentMinor: untaggedRows.reduce((total, row) => total + -row.amountMinor, 0),
          transactionCount: untaggedRows.length,
        },
        daily,
        weekly,
        byAccount,
        bySource,
        amountBands,
      };
    });
  }

  private categoriesOf(
    transactions: readonly Transaction[],
    names: ReadonlyMap<string, string>,
  ): ExpenseCategory[] {
    const totals = new Map<
      string,
      { spentMinor: number; transactionCount: number; largestMinor: number }
    >();
    for (const transaction of transactions) {
      const amount = -transaction.amountMinor;
      // The same tag twice on one movement is still one movement.
      for (const tagId of new Set(transaction.tagIds)) {
        const entry = totals.get(tagId) ?? {
          spentMinor: 0,
          transactionCount: 0,
          largestMinor: 0,
        };
        entry.spentMinor += amount;
        entry.transactionCount += 1;
        entry.largestMinor = Math.max(entry.largestMinor, amount);
        totals.set(tagId, entry);
      }
    }
    return [...totals.entries()]
      .map(([tagId, entry]) => ({
        tagId,
        tagName: names.get(tagId) ?? tagId,
        spentMinor: entry.spentMinor,
        transactionCount: entry.transactionCount,
        averageMinor: divide(entry.spentMinor, entry.transactionCount),
        largestMinor: entry.largestMinor,
      }))
      .sort(
        (left, right) =>
          right.spentMinor - left.spentMinor || left.tagName.localeCompare(right.tagName),
      );
  }

  private accountsOf(
    transactions: readonly Transaction[],
    names: ReadonlyMap<string, string>,
  ): ExpenseAccountLine[] {
    const totals = new Map<string, { spentMinor: number; transactionCount: number }>();
    for (const transaction of transactions) {
      const entry = totals.get(transaction.accountId) ?? { spentMinor: 0, transactionCount: 0 };
      entry.spentMinor += -transaction.amountMinor;
      entry.transactionCount += 1;
      totals.set(transaction.accountId, entry);
    }
    return [...totals.entries()]
      .map(([accountId, entry]) => ({
        accountId,
        accountName: names.get(accountId) ?? accountId,
        spentMinor: entry.spentMinor,
        transactionCount: entry.transactionCount,
      }))
      .sort(
        (left, right) =>
          right.spentMinor - left.spentMinor || left.accountName.localeCompare(right.accountName),
      );
  }

  private sourcesOf(transactions: readonly Transaction[]): ExpenseSourceLine[] {
    const totals = new Map<TransactionSource, { spentMinor: number; transactionCount: number }>();
    for (const transaction of transactions) {
      const entry = totals.get(transaction.source) ?? { spentMinor: 0, transactionCount: 0 };
      entry.spentMinor += -transaction.amountMinor;
      entry.transactionCount += 1;
      totals.set(transaction.source, entry);
    }
    return [...totals.entries()]
      .map(([source, entry]) => ({
        source,
        spentMinor: entry.spentMinor,
        transactionCount: entry.transactionCount,
      }))
      .sort((left, right) => right.spentMinor - left.spentMinor);
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
      if (isOwnTransfer(transaction)) continue;
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
      if (isOwnTransfer(transaction)) continue;
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
      if (isOwnTransfer(transaction)) continue;
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

  /**
   * Usage per tag, keyed by tag id: every movement that carries the tag (booked
   * or pending, any period) and every rule that applies it. The tag directory
   * reads this once instead of asking the ledger about each tag in turn.
   */
  async tagUsage(): Promise<Map<string, TagUsage>> {
    const [transactions, rules] = await Promise.all([
      this.vault.transactions.list(),
      this.vault.taggingRules.list(),
    ]);
    const usage = new Map<string, TagUsage>();
    const of = (tagId: string): TagUsage => {
      const entry = usage.get(tagId) ?? { transactions: 0, rules: 0 };
      usage.set(tagId, entry);
      return entry;
    };
    for (const transaction of transactions) {
      for (const tagId of new Set(transaction.tagIds)) of(tagId).transactions += 1;
    }
    for (const rule of rules) {
      for (const tagId of new Set(rule.tagIds)) of(tagId).rules += 1;
    }
    return usage;
  }

  private spendingOf(
    transactions: readonly Transaction[],
    tags: readonly Tag[] = [],
  ): TagSpending[] {
    const names = new Map(tags.map((tag: Tag) => [tag.id, tag.name]));
    const totals = new Map<string, TagSpending>();

    for (const transaction of transactions) {
      if (transaction.status !== "booked" || transaction.amountMinor >= 0) continue;
      if (isOwnTransfer(transaction)) continue;
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

/**
 * A movement the user marked as a transfer between their own accounts is the
 * same money seen twice, so it is neither income nor spending. It still counts
 * in the ledger, in the balances and in every export: this only keeps the flow
 * figures — income, expenses, net and the spending per tag — honest.
 */
function isOwnTransfer(transaction: Transaction): boolean {
  return transaction.transfer === true;
}

/** A movement that took money out and belongs to the flow figures. */
function isBookedOutflow(transaction: Transaction): boolean {
  return (
    transaction.status === "booked" && transaction.amountMinor < 0 && !isOwnTransfer(transaction)
  );
}

/** A movement that brought money in and belongs to the flow figures. */
function isBookedInflow(transaction: Transaction): boolean {
  return (
    transaction.status === "booked" && transaction.amountMinor >= 0 && !isOwnTransfer(transaction)
  );
}

/** Every ISO day of a range, both ends included, in UTC like every stored date. */
function daysOf(range: DateRange): string[] {
  const days: string[] = [];
  const start = new Date(`${range.from}T00:00:00.000Z`).getTime();
  const end = new Date(`${range.to}T00:00:00.000Z`).getTime();
  for (let at = start; at <= end; at += 86_400_000) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

/** Integer average; zero rather than NaN when there is nothing to divide. */
function divide(total: number, count: number): number {
  return count <= 0 ? 0 : Math.round(total / count);
}

/**
 * Booked outflows bucketed by their absolute amount. The edges are 10, 50, 150
 * and 500 major units scaled to the currency's own minor units, so a JPY vault
 * bands on whole yen and a KWD vault on fils.
 */
function amountBandsOf(transactions: readonly Transaction[], currency: string): ExpenseBand[] {
  const scale = 10 ** currencyInfo(currency).minorUnits;
  const thresholds = [10, 50, 150, 500].map((major) => major * scale);
  const keys: ExpenseBand["key"][] = ["under-10", "10-50", "50-150", "150-500", "over-500"];
  const bounds: Array<{ lowerMinor: number; upperMinor: number | null }> = [
    { lowerMinor: 0, upperMinor: thresholds[0]! },
    { lowerMinor: thresholds[0]!, upperMinor: thresholds[1]! },
    { lowerMinor: thresholds[1]!, upperMinor: thresholds[2]! },
    { lowerMinor: thresholds[2]!, upperMinor: thresholds[3]! },
    { lowerMinor: thresholds[3]!, upperMinor: null },
  ];
  const bands: ExpenseBand[] = keys.map((key, index) => {
    const bound = bounds[index]!;
    const label =
      bound.upperMinor === null
        ? `${formatMinorToAmount(bound.lowerMinor, currency)} and over`
        : bound.lowerMinor === 0
          ? `Under ${formatMinorToAmount(bound.upperMinor, currency)}`
          : `${formatMinorToAmount(bound.lowerMinor, currency)} – ${formatMinorToAmount(
              bound.upperMinor,
              currency,
            )}`;
    return {
      key,
      label,
      lowerMinor: bound.lowerMinor,
      upperMinor: bound.upperMinor,
      count: 0,
      spentMinor: 0,
    };
  });
  for (const transaction of transactions) {
    const amount = -transaction.amountMinor;
    const index = thresholds.findIndex((threshold) => amount < threshold);
    const band = bands[index === -1 ? bands.length - 1 : index]!;
    band.count += 1;
    band.spentMinor += amount;
  }
  return bands;
}
