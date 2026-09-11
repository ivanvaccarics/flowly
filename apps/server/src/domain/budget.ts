import { DomainError } from "./errors.js";
import { assertMinorAmount } from "./money.js";
import {
  assertCurrencyCode,
  assertIsoDate,
  assertIsoDateTime,
  assertRevision,
  assertText,
  assertUuid,
  assertUuidList,
} from "./values.js";

export const BUDGET_NAME_MAX = 80;

export type BudgetPeriod = "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
export const BUDGET_PERIODS: readonly BudgetPeriod[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
];

export interface Budget {
  formatVersion: 1;
  revision: number;
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  period: BudgetPeriod;
  startDate: string;
  endDate?: string;
  accountIds?: string[];
  tagIds?: string[];
  rollover: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function validateBudget(budget: Budget): void {
  if (budget.formatVersion !== 1) {
    throw new DomainError("invalid-budget", "budget formatVersion must be 1");
  }
  assertRevision(budget.revision, "budget.revision");
  assertUuid(budget.id, "budget.id");
  assertText(budget.name, "budget.name", { max: BUDGET_NAME_MAX });
  assertMinorAmount(budget.amountMinor);
  if (budget.amountMinor <= 0) {
    throw new DomainError("invalid-budget", "budget.amountMinor must be positive");
  }
  assertCurrencyCode(budget.currency, "budget.currency");
  if (!BUDGET_PERIODS.includes(budget.period)) {
    throw new DomainError("invalid-budget", `unsupported budget period: ${budget.period}`);
  }
  assertIsoDate(budget.startDate, "budget.startDate");
  if (budget.endDate !== undefined) assertIsoDate(budget.endDate, "budget.endDate");
  if (budget.period === "custom" && budget.endDate === undefined) {
    throw new DomainError("invalid-budget", "custom budgets need an endDate");
  }
  if (budget.endDate !== undefined && budget.endDate < budget.startDate) {
    throw new DomainError("invalid-budget", "budget.endDate must not precede startDate");
  }
  if (budget.accountIds !== undefined) assertUuidList(budget.accountIds, "budget.accountIds");
  if (budget.tagIds !== undefined) assertUuidList(budget.tagIds, "budget.tagIds");
  if (typeof budget.rollover !== "boolean" || typeof budget.active !== "boolean") {
    throw new DomainError("invalid-budget", "budget.rollover and budget.active must be boolean");
  }
  assertIsoDateTime(budget.createdAt, "budget.createdAt");
  assertIsoDateTime(budget.updatedAt, "budget.updatedAt");
}

export interface PeriodRange {
  startDate: string;
  endDate: string;
}

/**
 * Calendar-aware period range for a budget. Monthly and yearly periods keep the
 * anchor day-of-month and clamp to the last day of shorter months; weekly
 * periods advance in whole weeks from the start date.
 */
export function budgetPeriodRange(
  budget: Pick<Budget, "period" | "startDate" | "endDate">,
  referenceDate: string,
): PeriodRange {
  if (budget.period === "custom") {
    const endDate = budget.endDate;
    if (!endDate) {
      throw new DomainError("invalid-budget", "custom budgets need an endDate");
    }
    if (referenceDate < budget.startDate || referenceDate > endDate) {
      throw new DomainError("invalid-budget", "reference date is outside the custom period", {
        startDate: budget.startDate,
        endDate,
        referenceDate,
      });
    }
    return { startDate: budget.startDate, endDate };
  }

  if (referenceDate < budget.startDate) {
    throw new DomainError("invalid-budget", "reference date precedes the budget start", {
      startDate: budget.startDate,
      referenceDate,
    });
  }

  if (budget.period === "weekly") {
    const start = toUtcDate(budget.startDate);
    const reference = toUtcDate(referenceDate);
    const weeks = Math.floor((reference.getTime() - start.getTime()) / (7 * 86_400_000));
    const periodStart = addDays(start, weeks * 7);
    return { startDate: toIsoDate(periodStart), endDate: toIsoDate(addDays(periodStart, 6)) };
  }

  const stepMonths = budget.period === "monthly" ? 1 : budget.period === "quarterly" ? 3 : 12;
  const anchor = toUtcDate(budget.startDate);
  const reference = toUtcDate(referenceDate);
  const monthsApart =
    (reference.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (reference.getUTCMonth() - anchor.getUTCMonth());
  const steps = Math.floor(monthsApart / stepMonths);
  const periodStart = addMonthsClamped(anchor, steps * stepMonths);
  const periodEnd = addDays(addMonthsClamped(anchor, (steps + 1) * stepMonths), -1);
  return { startDate: toIsoDate(periodStart), endDate: toIsoDate(periodEnd) };
}

function toUtcDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function addMonthsClamped(date: Date, months: number): Date {
  const targetMonth = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return new Date(Date.UTC(year, month, day));
}
