import { DomainError } from "./errors.js";

export interface CurrencyInfo {
  code: string;
  minorUnits: number;
}

/** Currencies the MVP can format and validate. Extended by contract version bumps. */
export const SUPPORTED_CURRENCIES: readonly CurrencyInfo[] = [
  { code: "BHD", minorUnits: 3 },
  { code: "CHF", minorUnits: 2 },
  { code: "EUR", minorUnits: 2 },
  { code: "GBP", minorUnits: 2 },
  { code: "JPY", minorUnits: 0 },
  { code: "KRW", minorUnits: 0 },
  { code: "KWD", minorUnits: 3 },
  { code: "USD", minorUnits: 2 },
];

const BY_CODE = new Map(SUPPORTED_CURRENCIES.map((currency) => [currency.code, currency]));

export function isSupportedCurrency(code: string): boolean {
  return BY_CODE.has(code);
}

export function currencyInfo(code: string): CurrencyInfo {
  const currency = BY_CODE.get(code);
  if (!currency) {
    throw new DomainError("unsupported-currency", `unsupported currency: ${code}`, { code });
  }
  return currency;
}

export function isMinorAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertMinorAmount(value: unknown, field = "amountMinor"): asserts value is number {
  if (!isMinorAmount(value)) {
    throw new DomainError("invalid-amount", `${field} must be a safe integer`, { field, value });
  }
}

/** Parses a canonical decimal string into signed minor units without floats. */
export function parseAmountToMinor(text: string, currency: string): number {
  const { minorUnits } = currencyInfo(currency);
  const trimmed = text.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new DomainError("invalid-amount", `invalid amount for ${currency}: ${text}`, {
      text,
      currency,
    });
  }
  const sign = match[1] === "-" ? -1 : 1;
  const whole = match[2] ?? "0";
  const fraction = (match[3] ?? "").padEnd(minorUnits, "0");
  if (fraction.length > minorUnits) {
    throw new DomainError(
      "invalid-amount",
      `${currency} supports at most ${minorUnits} decimal places: ${text}`,
      { text, currency, minorUnits },
    );
  }
  const minor = Number(whole) * 10 ** minorUnits + Number(fraction || "0");
  if (!Number.isSafeInteger(minor)) {
    throw new DomainError("invalid-amount", `amount out of range: ${text}`, { text, currency });
  }
  return sign * minor;
}

export function formatMinorToAmount(minor: number, currency: string): string {
  const { minorUnits } = currencyInfo(currency);
  assertMinorAmount(minor);
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  if (minorUnits === 0) return `${sign}${absolute}`;
  const scale = 10 ** minorUnits;
  const whole = Math.trunc(absolute / scale);
  const fraction = String(absolute % scale).padStart(minorUnits, "0");
  return `${sign}${whole}.${fraction}`;
}

/** Formats a minor amount for display, without converting currencies. */
export function formatMoney(minor: number, currency: string): string {
  return `${formatMinorToAmount(minor, currency)} ${currency}`;
}
