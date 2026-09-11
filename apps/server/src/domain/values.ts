import { DomainError } from "./errors.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/** Any RFC 4122 UUID is accepted on import; Flowly only generates v7. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isUuidV7(value: unknown): value is string {
  return typeof value === "string" && UUID_V7_PATTERN.test(value);
}

export function assertUuid(value: unknown, field: string): asserts value is string {
  if (!isUuid(value)) {
    throw new DomainError("invalid-value", `${field} must be a UUID`, { field, value });
  }
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function assertIsoDate(value: unknown, field: string): asserts value is string {
  if (!isIsoDate(value)) {
    throw new DomainError("invalid-value", `${field} must be an ISO 8601 date`, { field, value });
  }
}

export function isIsoDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_DATE_TIME_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function assertIsoDateTime(value: unknown, field: string): asserts value is string {
  if (!isIsoDateTime(value)) {
    throw new DomainError("invalid-value", `${field} must be an ISO 8601 UTC timestamp`, {
      field,
      value,
    });
  }
}

export function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && CURRENCY_PATTERN.test(value);
}

export function assertCurrencyCode(value: unknown, field: string): asserts value is string {
  if (!isCurrencyCode(value)) {
    throw new DomainError("invalid-value", `${field} must be an ISO 4217 code`, { field, value });
  }
}

/** Unicode NFKC, trimmed, whitespace collapsed, lowercased. */
export function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeTagName(value: string): string {
  return normalizeText(value);
}

export function assertText(
  value: unknown,
  field: string,
  options: { max: number; min?: number; optional?: boolean },
): void {
  const { max, min = 1, optional = false } = options;
  if (value === undefined) {
    if (optional) return;
    throw new DomainError("invalid-value", `${field} is required`, { field });
  }
  if (typeof value !== "string") {
    throw new DomainError("invalid-value", `${field} must be a string`, { field, value });
  }
  const length = [...value].length;
  if (length < min || length > max) {
    throw new DomainError("invalid-value", `${field} must be ${min}-${max} characters`, {
      field,
      length,
    });
  }
}

export function assertUuidList(
  value: unknown,
  field: string,
  max = 100,
): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new DomainError("invalid-value", `${field} must be an array`, { field });
  }
  if (value.length > max) {
    throw new DomainError("invalid-value", `${field} accepts at most ${max} entries`, { field });
  }
  const seen = new Set<string>();
  for (const entry of value) {
    assertUuid(entry, field);
    if (seen.has(entry)) {
      throw new DomainError("invalid-value", `${field} contains a duplicate id`, { field, entry });
    }
    seen.add(entry);
  }
}
