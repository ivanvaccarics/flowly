import { FlowlySpikeError } from "../errors.ts";

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

export function minorUnitsFor(currency: string): number {
  const code = currency.toUpperCase();
  const units = MINOR_UNITS[code];
  if (units === undefined) {
    throw new FlowlySpikeError(`unknown currency code: ${currency}`);
  }
  return units;
}

/** Parses a canonical decimal string into signed minor units, without floats. */
export function parseAmountToMinor(text: string, currency: string): number {
  const units = minorUnitsFor(currency);
  const trimmed = text.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new FlowlySpikeError(`invalid amount for ${currency}: ${JSON.stringify(text)}`);
  }
  const sign = match[1] === "-" ? -1 : 1;
  const whole = match[2] ?? "0";
  const fraction = (match[3] ?? "").padEnd(units, "0");
  if (fraction.length > units) {
    throw new FlowlySpikeError(
      `${currency} supports at most ${units} decimal places: ${JSON.stringify(text)}`,
    );
  }
  const minor = Number(whole) * 10 ** units + Number(fraction || "0");
  if (!Number.isSafeInteger(minor)) {
    throw new FlowlySpikeError(`amount out of range: ${JSON.stringify(text)}`);
  }
  return sign * minor;
}

export function formatMinorToAmount(minor: number, currency: string): string {
  const units = minorUnitsFor(currency);
  if (!Number.isSafeInteger(minor)) {
    throw new FlowlySpikeError(`minor amount must be a safe integer: ${minor}`);
  }
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  if (units === 0) return `${sign}${absolute}`;
  const scale = 10 ** units;
  const whole = Math.trunc(absolute / scale);
  const fraction = String(absolute % scale).padStart(units, "0");
  return `${sign}${whole}.${fraction}`;
}
