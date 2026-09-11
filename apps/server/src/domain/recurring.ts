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

export const RECURRING_NAME_MAX = 80;
export const PAYEE_MAX = 120;
export const USER_NOTE_MAX = 2000;

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[] = [
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

export interface RecurringTemplate {
  accountId: string;
  amountMinor: number;
  currency: string;
  payee?: string;
  userNote?: string;
  tagIds?: string[];
}

/**
 * Phase 1 defines the shape and its invariants only. Occurrence generation and
 * the full contract (end-of-month and time-zone behaviour) land in Phase 7.
 */
export interface RecurringRule {
  formatVersion: 1;
  revision: number;
  id: string;
  name: string;
  template: RecurringTemplate;
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate?: string;
  nextDueDate?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function validateRecurringRule(rule: RecurringRule): void {
  if (rule.formatVersion !== 1) {
    throw new DomainError("invalid-recurring-rule", "recurring rule formatVersion must be 1");
  }
  assertRevision(rule.revision, "recurringRule.revision");
  assertUuid(rule.id, "recurringRule.id");
  assertText(rule.name, "recurringRule.name", { max: RECURRING_NAME_MAX });
  if (!RECURRENCE_FREQUENCIES.includes(rule.frequency)) {
    throw new DomainError("invalid-recurring-rule", `unsupported frequency: ${rule.frequency}`);
  }
  if (!Number.isSafeInteger(rule.interval) || rule.interval < 1 || rule.interval > 60) {
    throw new DomainError("invalid-recurring-rule", "interval must be between 1 and 60");
  }
  assertIsoDate(rule.startDate, "recurringRule.startDate");
  if (rule.endDate !== undefined) {
    assertIsoDate(rule.endDate, "recurringRule.endDate");
    if (rule.endDate < rule.startDate) {
      throw new DomainError("invalid-recurring-rule", "endDate must not precede startDate");
    }
  }
  if (rule.nextDueDate !== undefined) assertIsoDate(rule.nextDueDate, "recurringRule.nextDueDate");
  if (typeof rule.active !== "boolean") {
    throw new DomainError("invalid-recurring-rule", "active must be a boolean");
  }
  assertUuid(rule.template.accountId, "recurringRule.template.accountId");
  assertMinorAmount(rule.template.amountMinor, "recurringRule.template.amountMinor");
  assertCurrencyCode(rule.template.currency, "recurringRule.template.currency");
  if (rule.template.payee !== undefined) {
    assertText(rule.template.payee, "recurringRule.template.payee", {
      max: PAYEE_MAX,
      optional: true,
    });
  }
  if (rule.template.userNote !== undefined) {
    assertText(rule.template.userNote, "recurringRule.template.userNote", {
      max: USER_NOTE_MAX,
      optional: true,
    });
  }
  if (rule.template.tagIds !== undefined) {
    assertUuidList(rule.template.tagIds, "recurringRule.template.tagIds");
  }
  assertIsoDateTime(rule.createdAt, "recurringRule.createdAt");
  assertIsoDateTime(rule.updatedAt, "recurringRule.updatedAt");
}
