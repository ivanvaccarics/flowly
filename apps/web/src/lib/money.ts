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

/** Client-side helper; the server validates and stores the authoritative value. */
export function parseAmountToMinor(text: string, currency: string): number {
  const units = minorUnitsFor(currency);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) throw new Error(`"${text}" is not a valid amount`);
  const fraction = (match[3] ?? "").padEnd(units, "0");
  if (fraction.length > units) throw new Error(`${currency} allows ${units} decimals`);
  const minor = Number(match[2]) * 10 ** units + Number(fraction || "0");
  if (!Number.isSafeInteger(minor)) throw new Error("amount is too large");
  return (match[1] === "-" ? -1 : 1) * minor;
}

export function formatMinorToAmount(minor: number, currency: string): string {
  const units = minorUnitsFor(currency);
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  if (units === 0) return `${sign}${absolute}`;
  const scale = 10 ** units;
  return `${sign}${Math.trunc(absolute / scale)}.${String(absolute % scale).padStart(units, "0")}`;
}

export function formatMoney(minor: number, currency: string): string {
  return `${formatMinorToAmount(minor, currency)} ${currency}`;
}
