import { budgetPeriodRange, type Budget } from "../domain/budget.js";
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

export type BudgetStatus = "on-track" | "warning" | "over";

export interface BudgetProgress {
  budgetId: string;
  name: string;
  currency: string;
  period: Budget["period"];
  periodStart: string;
  periodEnd: string;
  limitMinor: number;
  rolloverCarryMinor: number;
  spentMinor: number;
  remainingMinor: number;
  percentUsed: number;
  status: BudgetStatus;
  skippedOtherCurrencies: number;
}

export interface Dashboard {
  range: DateRange;
  generatedAt: string;
  balances: AccountBalance[];
  cashFlow: CurrencyTotals[];
  spendingByTag: TagSpending[];
  budgets: BudgetProgress[];
}

/**
 * Dashboard, cash flow, spending by tag and budget consumption.
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

  async dashboard(range: DateRange, referenceDate = range.to): Promise<Dashboard> {
    return cacheFor(this.vault, this.clock).get(
      `dashboard|${range.from}|${range.to}|${referenceDate}`,
      async () => {
        const [balances, cashFlow, spendingByTag, budgets] = await Promise.all([
          this.balances(),
          this.cashFlow(range),
          this.spendingByTag(range),
          this.budgetProgress(referenceDate),
        ]);
        return {
          range,
          generatedAt: this.clock.nowIso(),
          balances,
          cashFlow,
          spendingByTag,
          budgets,
        };
      },
    );
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

  /**
   * Consumption for every active budget at a reference date.
   *
   * A transaction counts when it is booked, it is an outflow, it falls in the
   * budget period, it matches the budget's account and tag filters, and it is in
   * the budget currency — or carries an explicit original amount in it. Other
   * currencies are counted as skipped and never converted implicitly.
   */
  async budgetProgress(referenceDate = this.clock.todayIso()): Promise<BudgetProgress[]> {
    return cacheFor(this.vault, this.clock).get(`budgets|${referenceDate}`, () =>
      this.computeBudgetProgress(referenceDate),
    );
  }

  private async computeBudgetProgress(referenceDate: string): Promise<BudgetProgress[]> {
    const [budgets, transactions] = await Promise.all([
      this.vault.budgets.list(),
      this.vault.transactions.list(),
    ]);
    const progress: BudgetProgress[] = [];

    for (const budget of budgets.filter((candidate) => candidate.active)) {
      const range = budgetPeriodRange(budget, referenceDate);
      const { spentMinor, skippedOtherCurrencies } = this.spendForBudget(
        budget,
        transactions,
        range,
      );
      const rolloverCarryMinor = budget.rollover
        ? Math.max(0, await this.previousPeriodCarry(budget, transactions, range))
        : 0;
      const limitMinor = budget.amountMinor + rolloverCarryMinor;
      const remainingMinor = limitMinor - spentMinor;
      const percentUsed = limitMinor === 0 ? 0 : round2((spentMinor * 100) / limitMinor);
      progress.push({
        budgetId: budget.id,
        name: budget.name,
        currency: budget.currency,
        period: budget.period,
        periodStart: range.startDate,
        periodEnd: range.endDate,
        limitMinor,
        rolloverCarryMinor,
        spentMinor,
        remainingMinor,
        percentUsed,
        status: percentUsed >= 100 ? "over" : percentUsed >= 80 ? "warning" : "on-track",
        skippedOtherCurrencies,
      });
    }

    return progress.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  /** Human-readable amounts for logs and UI previews; never locale formatted. */
  format(minor: number, currency: string): string {
    return formatMinorToAmount(minor, currency);
  }

  private async inRange(range: DateRange): Promise<Transaction[]> {
    return this.vault.transactions.list({
      refBFrom: range.from,
      refBTo: range.to,
    });
  }

  private spendForBudget(
    budget: Budget,
    transactions: readonly Transaction[],
    range: { startDate: string; endDate: string },
  ): { spentMinor: number; skippedOtherCurrencies: number } {
    let spentMinor = 0;
    let skippedOtherCurrencies = 0;
    for (const transaction of transactions) {
      if (transaction.status !== "booked" || transaction.amountMinor >= 0) continue;
      if (transaction.bookingDate < range.startDate || transaction.bookingDate > range.endDate) {
        continue;
      }
      if (budget.accountIds && budget.accountIds.length > 0) {
        if (!budget.accountIds.includes(transaction.accountId)) continue;
      }
      if (budget.tagIds && budget.tagIds.length > 0) {
        if (!transaction.tagIds.some((tagId) => budget.tagIds?.includes(tagId))) continue;
      }
      if (transaction.currency === budget.currency) {
        spentMinor += -transaction.amountMinor;
        continue;
      }
      if (
        transaction.originalCurrency === budget.currency &&
        typeof transaction.originalAmountMinor === "number" &&
        transaction.originalAmountMinor < 0
      ) {
        spentMinor += -transaction.originalAmountMinor;
        continue;
      }
      skippedOtherCurrencies += 1;
    }
    return { spentMinor, skippedOtherCurrencies };
  }

  private async previousPeriodCarry(
    budget: Budget,
    transactions: readonly Transaction[],
    range: { startDate: string },
  ): Promise<number> {
    const reference = previousDay(range.startDate);
    if (reference < budget.startDate) return 0;
    try {
      const previous = budgetPeriodRange(budget, reference);
      const { spentMinor } = this.spendForBudget(budget, transactions, previous);
      return budget.amountMinor - spentMinor;
    } catch {
      return 0;
    }
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function previousDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day - 1));
  return date.toISOString().slice(0, 10);
}
