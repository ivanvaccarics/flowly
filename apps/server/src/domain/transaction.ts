import { createHash } from "node:crypto";
import { DomainError } from "./errors.js";
import { assertMinorAmount, isSupportedCurrency } from "./money.js";
import {
  assertCurrencyCode,
  assertIsoDate,
  assertIsoDateTime,
  assertRevision,
  assertText,
  assertUuid,
  assertUuidList,
  isCurrencyCode,
  normalizeText,
} from "./values.js";

export const PAYEE_MAX = 120;
export const DESCRIPTION_MAX = 500;
export const USER_NOTE_MAX = 2000;
export const FINGERPRINT_VERSION = "v1";

export type TransactionStatus = "pending" | "booked";
export type TransactionSource = "manual" | "csv-import" | "enable-banking";

export const TRANSACTION_STATUSES: readonly TransactionStatus[] = ["pending", "booked"];
export const TRANSACTION_SOURCES: readonly TransactionSource[] = [
  "manual",
  "csv-import",
  "enable-banking",
];

export interface Transaction {
  formatVersion: 1;
  revision: number;
  id: string;
  accountId: string;
  bookingDate: string;
  valueDate?: string;
  amountMinor: number;
  currency: string;
  originalAmountMinor?: number;
  originalCurrency?: string;
  payee?: string;
  description?: string;
  userNote?: string;
  status: TransactionStatus;
  source: TransactionSource;
  tagIds: string[];
  provider?: string;
  providerAccountId?: string;
  providerTransactionId?: string;
  importFingerprint?: string;
  createdAt: string;
  updatedAt: string;
}

export function validateTransaction(transaction: Transaction): void {
  if (transaction.formatVersion !== 1) {
    throw new DomainError("invalid-transaction", "transaction formatVersion must be 1");
  }
  assertRevision(transaction.revision, "transaction.revision");
  assertUuid(transaction.id, "transaction.id");
  assertUuid(transaction.accountId, "transaction.accountId");
  assertIsoDate(transaction.bookingDate, "transaction.bookingDate");
  if (transaction.valueDate !== undefined) {
    assertIsoDate(transaction.valueDate, "transaction.valueDate");
  }
  assertMinorAmount(transaction.amountMinor);
  assertCurrencyCode(transaction.currency, "transaction.currency");
  if (!isSupportedCurrency(transaction.currency)) {
    throw new DomainError("invalid-transaction", `unsupported currency: ${transaction.currency}`, {
      currency: transaction.currency,
    });
  }
  if (transaction.originalAmountMinor !== undefined) {
    assertMinorAmount(transaction.originalAmountMinor, "transaction.originalAmountMinor");
    if (!isCurrencyCode(transaction.originalCurrency)) {
      throw new DomainError(
        "invalid-transaction",
        "transaction.originalCurrency is required with originalAmountMinor",
      );
    }
  }
  if (transaction.originalCurrency !== undefined) {
    assertCurrencyCode(transaction.originalCurrency, "transaction.originalCurrency");
  }
  assertText(transaction.payee, "transaction.payee", { max: PAYEE_MAX, optional: true });
  assertText(transaction.description, "transaction.description", {
    max: DESCRIPTION_MAX,
    optional: true,
  });
  assertText(transaction.userNote, "transaction.userNote", {
    max: USER_NOTE_MAX,
    optional: true,
  });
  if (!TRANSACTION_STATUSES.includes(transaction.status)) {
    throw new DomainError("invalid-transaction", `unsupported status: ${transaction.status}`);
  }
  if (!TRANSACTION_SOURCES.includes(transaction.source)) {
    throw new DomainError("invalid-transaction", `unsupported source: ${transaction.source}`);
  }
  assertUuidList(transaction.tagIds, "transaction.tagIds");
  if (
    transaction.importFingerprint !== undefined &&
    !/^[0-9a-f]{32}$/.test(transaction.importFingerprint)
  ) {
    throw new DomainError(
      "invalid-transaction",
      "transaction.importFingerprint must be 32 hex chars",
    );
  }
  assertIsoDateTime(transaction.createdAt, "transaction.createdAt");
  assertIsoDateTime(transaction.updatedAt, "transaction.updatedAt");
}

export interface NewTransaction {
  accountId: string;
  bookingDate: string;
  amountMinor: number;
  currency: string;
  valueDate?: string;
  payee?: string;
  description?: string;
  userNote?: string;
  status?: TransactionStatus;
  source?: TransactionSource;
  tagIds?: string[];
  provider?: string;
  providerTransactionId?: string;
  importFingerprint?: string;
}

export function createTransaction(
  input: NewTransaction,
  deps: { id: string; now: string },
): Transaction {
  const transaction: Transaction = {
    formatVersion: 1,
    revision: 1,
    id: deps.id,
    accountId: input.accountId,
    bookingDate: input.bookingDate,
    amountMinor: input.amountMinor,
    currency: input.currency,
    status: input.status ?? "booked",
    source: input.source ?? "manual",
    tagIds: input.tagIds ?? [],
    createdAt: deps.now,
    updatedAt: deps.now,
    ...(input.valueDate ? { valueDate: input.valueDate } : {}),
    ...(input.payee ? { payee: input.payee } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.userNote ? { userNote: input.userNote } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.providerTransactionId ? { providerTransactionId: input.providerTransactionId } : {}),
    ...(input.importFingerprint ? { importFingerprint: input.importFingerprint } : {}),
  };
  validateTransaction(transaction);
  return transaction;
}

export interface FingerprintInput {
  accountId: string;
  bookingDate: string;
  amountMinor: number;
  currency: string;
  description?: string;
  payee?: string;
}

/**
 * Deterministic import fingerprint, version 1.
 * Payload: `v1|accountId|bookingDate|amountMinor|currency|normalizedText`,
 * where the text is the provider description when present, otherwise the payee.
 * Output: the first 32 hex characters of the SHA-256 digest.
 */
export function importFingerprint(input: FingerprintInput): string {
  const text = normalizeText(input.description ?? input.payee ?? "");
  const payload = [
    FINGERPRINT_VERSION,
    input.accountId,
    input.bookingDate,
    String(input.amountMinor),
    input.currency,
    text,
  ].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 32);
}
