import type { AccountType } from "../domain/account.js";
import { parseAmountToMinor } from "../domain/money.js";
import type { TransactionStatus } from "../domain/transaction.js";
import { isIsoDate, isIsoDateTime } from "../domain/values.js";
import type { EbAccountResource, EbAmount, EbTransaction } from "./enable-banking-types.js";

const PAYEE_MAX = 120;
const DESCRIPTION_MAX = 500;

const ACCOUNT_TYPE_BY_CASH_ACCOUNT_TYPE: Readonly<Record<string, AccountType>> = {
  CACC: "checking",
  CARD: "credit-card",
  CASH: "cash",
  LOAN: "other",
  OTHR: "other",
  SVGS: "savings",
};

/**
 * ISO 20022 balance types we prefer for a "current balance" reading, most
 * authoritative first. `CLBD` is the accounting balance, `ITBD` the interim one.
 */
const BALANCE_TYPE_PREFERENCE = ["CLBD", "ITBD", "CLAV", "ITAV", "OPBD", "PRCD", "XPCD", "OTHR"];

export interface NormalizedAccount {
  name: string;
  type: AccountType;
  currency?: string;
  institutionName: string;
  iban?: string;
  identificationHash?: string;
  cashAccountType?: string;
  providerName?: string;
}

export type NormalizedTransaction =
  | {
      ok: true;
      bookingDate: string;
      valueDate?: string;
      amountMinor: number;
      currency: string;
      payee?: string;
      description?: string;
      status: TransactionStatus;
      providerTransactionId?: string;
      /** The provider status code (BOOK, PDNG, …) kept for the raw record. */
      providerStatus: string;
    }
  | {
      ok: false;
      reason: "missing-amount" | "missing-date" | "unsupported-currency";
      detail: string;
    };

export function accountTypeFromCashAccountType(value: string | null | undefined): AccountType {
  if (!value) return "other";
  return ACCOUNT_TYPE_BY_CASH_ACCOUNT_TYPE[value.toUpperCase()] ?? "other";
}

/**
 * Turns an Enable Banking account into the fields a Flowly account needs.
 * The display name prefers the PSU/ASPSP description, then the product, then a
 * masked IBAN, so the user always recognizes the account.
 */
export function normalizeAccount(
  account: EbAccountResource,
  aspsp: { name: string },
  fallbackName = "Account",
): NormalizedAccount {
  const iban = normalizeIban(account.account_id?.iban ?? undefined);
  const providerName = trimTo(account.details ?? account.name ?? undefined, PAYEE_MAX);
  const name =
    providerName ??
    trimTo(account.product ?? undefined, PAYEE_MAX) ??
    (iban ? `${aspsp.name} ${maskIban(iban)}` : `${aspsp.name} ${fallbackName}`);
  return {
    name: name.trim().length > 0 ? name.trim() : fallbackName,
    type: accountTypeFromCashAccountType(account.cash_account_type),
    ...(account.currency ? { currency: account.currency.toUpperCase() } : {}),
    institutionName: aspsp.name,
    ...(iban ? { iban } : {}),
    ...(account.identification_hash ? { identificationHash: account.identification_hash } : {}),
    ...(account.cash_account_type ? { cashAccountType: account.cash_account_type } : {}),
    ...(providerName ? { providerName } : {}),
  };
}

export function normalizeIban(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, "").toUpperCase();
  return compact.length >= 13 && compact.length <= 34 ? compact : undefined;
}

export function maskIban(iban: string): string {
  return `····${iban.slice(-4)}`;
}

/** Picks the most meaningful balance from the ASPSP's list. */
export function pickBalance(
  balances: readonly { balance_type?: string | null; balance_amount?: EbAmount | null }[],
): { minor: number; currency: string; type?: string } | undefined {
  const usable = balances
    .map((balance) => ({
      type: (balance.balance_type ?? "").toUpperCase(),
      amount: balance.balance_amount,
    }))
    .filter(
      (entry): entry is { type: string; amount: EbAmount } =>
        entry.amount !== null &&
        entry.amount !== undefined &&
        typeof entry.amount.amount === "string" &&
        typeof entry.amount.currency === "string",
    );
  for (const preferred of BALANCE_TYPE_PREFERENCE) {
    const match = usable.find((entry) => entry.type === preferred);
    if (match) return toBalance(match.amount, match.type);
  }
  const first = usable[0];
  return first ? toBalance(first.amount, first.type) : undefined;
}

function toBalance(
  amount: EbAmount,
  type: string,
): { minor: number; currency: string; type?: string } | undefined {
  try {
    return {
      minor: parseAmountToMinor(amount.amount, amount.currency.toUpperCase()),
      currency: amount.currency.toUpperCase(),
      ...(type ? { type } : {}),
    };
  } catch {
    // An amount in a currency Flowly cannot represent is reported as no balance.
    return undefined;
  }
}

/**
 * Maps one provider transaction onto Flowly's domain.
 *
 * The provider reports an unsigned amount plus a `CRDT`/`DBIT` indicator, so
 * the sign is applied here. Both the documented snake_case fields and the
 * camelCase aliases of previously exported payloads are accepted.
 */
export function normalizeTransaction(transaction: EbTransaction): NormalizedTransaction {
  const amount = transaction.transaction_amount ?? transaction.transactionAmount;
  if (!amount || typeof amount.amount !== "string" || typeof amount.currency !== "string") {
    return { ok: false, reason: "missing-amount", detail: "transaction has no amount" };
  }
  const currency = amount.currency.trim().toUpperCase();
  const bookingDate =
    transaction.booking_date ??
    transaction.bookingDate ??
    transaction.value_date ??
    transaction.valueDate ??
    transaction.transaction_date;
  if (!isIsoDate(bookingDate)) {
    return {
      ok: false,
      reason: "missing-date",
      detail: "transaction has no usable booking or value date",
    };
  }

  let magnitude: number;
  try {
    magnitude = Math.abs(parseAmountToMinor(amount.amount, currency));
  } catch {
    return {
      ok: false,
      reason: "unsupported-currency",
      detail: `cannot represent ${amount.amount} ${currency}`,
    };
  }

  const indicator = (
    transaction.credit_debit_indicator ??
    transaction.creditDebitIndicator ??
    ""
  ).toUpperCase();
  const outgoing = indicator === "DBIT" || (!indicator && amount.amount.trim().startsWith("-"));
  const amountMinor = outgoing ? -magnitude : magnitude;

  const remittance = normalizeRemittance(transaction.remittance_information);
  const counterparty = trimTo(
    (outgoing ? transaction.creditor?.name : transaction.debtor?.name) ?? undefined,
    PAYEE_MAX,
  );
  // The remittance fallback is description-length; the payee field only holds
  // 120 characters, so it is clamped to that before it leaves normalization.
  const payee = counterparty ?? trimTo(remittance, PAYEE_MAX);
  const description =
    trimTo(transaction.bank_transaction_code?.description ?? undefined, DESCRIPTION_MAX) ??
    remittance;
  const valueDate = firstDate(transaction.value_date ?? transaction.valueDate);
  const providerTransactionId =
    firstText(transaction.entry_reference) ?? firstText(transaction.transaction_id);

  return {
    ok: true,
    bookingDate,
    ...(valueDate ? { valueDate } : {}),
    amountMinor,
    currency,
    ...(payee ? { payee } : {}),
    ...(description ? { description } : {}),
    status: transactionStatus(transaction.status),
    ...(providerTransactionId ? { providerTransactionId } : {}),
    providerStatus: (transaction.status ?? "BOOK").toUpperCase(),
  };
}

/** Flowly stores only pending/booked; anything not booked is still unsettled. */
export function transactionStatus(status: string | null | undefined): TransactionStatus {
  return (status ?? "").toUpperCase() === "BOOK" ? "booked" : "pending";
}

export function normalizeRemittance(lines: string[] | null | undefined): string | undefined {
  if (!Array.isArray(lines)) return undefined;
  const joined = lines
    .filter((line) => typeof line === "string" && line.trim().length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return joined.length > 0 ? trimTo(joined, DESCRIPTION_MAX) : undefined;
}

/**
 * Enable Banking returns RFC 3339 timestamps with `+00:00` offsets and up to
 * six fractional digits, while Flowly stores canonical UTC milliseconds.
 */
export function normalizeTimestamp(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  if (isIsoDateTime(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Truncates on code points so a long provider text never breaks validation. */
export function trimTo(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  const characters = [...value.trim()];
  if (characters.length === 0) return undefined;
  return characters.slice(0, max).join("");
}

function firstText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstDate(value: string | null | undefined): string | undefined {
  return isIsoDate(value) ? value : undefined;
}
