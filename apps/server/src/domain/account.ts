import { DomainError } from "./errors.js";
import { currencyInfo, isSupportedCurrency } from "./money.js";
import {
  assertIsoDateTime,
  assertRevision,
  assertText,
  assertUuid,
  isCurrencyCode,
} from "./values.js";

export const ACCOUNT_NAME_MAX = 80;
export const INSTITUTION_NAME_MAX = 120;

export type AccountType =
  "checking" | "savings" | "credit-card" | "cash" | "wallet" | "investment" | "other";

export const ACCOUNT_TYPES: readonly AccountType[] = [
  "checking",
  "savings",
  "credit-card",
  "cash",
  "wallet",
  "investment",
  "other",
];

export interface Account {
  formatVersion: 1;
  revision: number;
  id: string;
  name: string;
  type: AccountType;
  defaultCurrency: string;
  institutionName?: string;
  openingBalanceMinor?: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function validateAccount(account: Account): void {
  if (account.formatVersion !== 1) {
    throw new DomainError("invalid-account", "account formatVersion must be 1");
  }
  assertRevision(account.revision, "account.revision");
  assertUuid(account.id, "account.id");
  assertText(account.name, "account.name", { max: ACCOUNT_NAME_MAX });
  if (!ACCOUNT_TYPES.includes(account.type)) {
    throw new DomainError("invalid-account", `unsupported account type: ${account.type}`, {
      type: account.type,
    });
  }
  if (!isCurrencyCode(account.defaultCurrency) || !isSupportedCurrency(account.defaultCurrency)) {
    throw new DomainError(
      "invalid-account",
      `unsupported default currency: ${account.defaultCurrency}`,
      {
        currency: account.defaultCurrency,
      },
    );
  }
  currencyInfo(account.defaultCurrency);
  if (account.institutionName !== undefined) {
    assertText(account.institutionName, "account.institutionName", {
      max: INSTITUTION_NAME_MAX,
    });
  }
  if (
    account.openingBalanceMinor !== undefined &&
    !Number.isSafeInteger(account.openingBalanceMinor)
  ) {
    throw new DomainError("invalid-account", "account.openingBalanceMinor must be a safe integer");
  }
  if (account.archivedAt !== undefined) assertIsoDateTime(account.archivedAt, "account.archivedAt");
  assertIsoDateTime(account.createdAt, "account.createdAt");
  assertIsoDateTime(account.updatedAt, "account.updatedAt");
}

export interface NewAccount {
  name: string;
  type: AccountType;
  defaultCurrency: string;
  institutionName?: string;
  openingBalanceMinor?: number;
}

export function createAccount(input: NewAccount, deps: { id: string; now: string }): Account {
  const account: Account = {
    formatVersion: 1,
    revision: 1,
    id: deps.id,
    name: input.name.trim(),
    type: input.type,
    defaultCurrency: input.defaultCurrency,
    ...(input.institutionName ? { institutionName: input.institutionName.trim() } : {}),
    ...(input.openingBalanceMinor !== undefined
      ? { openingBalanceMinor: input.openingBalanceMinor }
      : {}),
    createdAt: deps.now,
    updatedAt: deps.now,
  };
  validateAccount(account);
  return account;
}
