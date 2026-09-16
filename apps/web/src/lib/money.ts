const MINOR_UNITS: Record<string, number> = {
  BHD: 3,
  CHF: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  USD: 2,
};

export const CURRENCIES = Object.keys(MINOR_UNITS);
export const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "credit-card",
  "cash",
  "wallet",
  "investment",
  "other",
];

export function minorUnitsFor(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2;
}

/** `1234567` → `1.234.567`: Italian grouping, so every figure reads the same. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Parses what a person types. Flowly shows Italian grouping (`1.234,56`), but
 * both conventions are accepted so a `1,234.56` pasted from a statement still
 * lands on the right amount. Client-side helper; the server validates and stores
 * the authoritative value.
 */
export function parseAmountToMinor(text: string, currency: string): number {
  const units = minorUnitsFor(currency);
  const cleaned = text.trim().replace(/[\s\u00a0']/g, "");
  const match = /^([+-]?)(\d[\d.,]*)$/.exec(cleaned);
  if (!match) throw new Error(`"${text}" is not a valid amount`);
  const body = match[2]!;
  const dot = body.lastIndexOf(".");
  const comma = body.lastIndexOf(",");
  const separator = Math.max(dot, comma);
  let decimalAt = -1;
  if (separator >= 0) {
    const kind = body[separator];
    const repeated = body.split(kind!).length - 1;
    const before = body.slice(0, separator);
    const after = body.slice(separator + 1);
    const looksLikeGrouping =
      repeated > 1 ||
      (after.length === 3 && units !== 3 && before.length >= 1 && before.length <= 3);
    decimalAt = looksLikeGrouping ? -1 : separator;
  }
  const wholeDigits = (decimalAt >= 0 ? body.slice(0, decimalAt) : body).replace(/[.,]/g, "");
  const fractionDigits = decimalAt >= 0 ? body.slice(decimalAt + 1) : "";
  if (wholeDigits === "" || !/^\d+$/.test(wholeDigits) || !/^\d*$/.test(fractionDigits)) {
    throw new Error(`"${text}" is not a valid amount`);
  }
  if (fractionDigits.length > units) throw new Error(`${currency} allows ${units} decimals`);
  const fraction = fractionDigits.padEnd(units, "0");
  const minor = Number(wholeDigits) * 10 ** units + Number(fraction || "0");
  if (!Number.isSafeInteger(minor)) throw new Error("amount is too large");
  return (match[1] === "-" ? -1 : 1) * minor;
}

export function formatMinorToAmount(minor: number, currency: string): string {
  const units = minorUnitsFor(currency);
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  if (units === 0) return `${sign}${groupThousands(String(absolute))}`;
  const scale = 10 ** units;
  const whole = groupThousands(String(Math.trunc(absolute / scale)));
  return `${sign}${whole},${String(absolute % scale).padStart(units, "0")}`;
}

export function formatMoney(minor: number, currency: string): string {
  return `${formatMinorToAmount(minor, currency)} ${currency}`;
}

/** Percentages and rates keep the same Italian decimal comma as the amounts. */
export function formatDecimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}
