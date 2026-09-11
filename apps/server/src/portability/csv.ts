import type { Account } from "../domain/account.js";
import { formatMinorToAmount, parseAmountToMinor } from "../domain/money.js";
import type { Tag } from "../domain/tag.js";
import type { TaggingRule } from "../domain/tagging-rule.js";
import type { Transaction, TransactionSource, TransactionStatus } from "../domain/transaction.js";
import { DomainError } from "../domain/errors.js";
import { assertIsoDate, assertUuid, isUuid, normalizeTagName } from "../domain/values.js";

export const TRANSACTION_CSV_HEADER = [
  "id",
  "account_id",
  "booking_date",
  "value_date",
  "amount",
  "currency",
  "payee",
  "description",
  "user_note",
  "status",
  "source",
  "tags",
] as const;

export const ACCOUNT_CSV_HEADER = [
  "id",
  "name",
  "type",
  "default_currency",
  "institution_name",
  "opening_balance",
  "archived_at",
] as const;

export const TAG_CSV_HEADER = ["id", "name", "normalized_name", "color"] as const;

export const TAGGING_RULE_CSV_HEADER = [
  "id",
  "name",
  "enabled",
  "combinator",
  "conditions",
  "tag_names",
  "created_at",
  "updated_at",
] as const;

const FORMULA_TRIGGER = /^[=+@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

/** Spreadsheet formula-injection protection that keeps plain numbers intact. */
export function protectCell(value: string): string {
  if (FORMULA_TRIGGER.test(value)) return `'${value}`;
  if (value.startsWith("-") && !PLAIN_NUMBER.test(value)) return `'${value}`;
  return value;
}

export function unprotectCell(value: string): string {
  if (!value.startsWith("'")) return value;
  const remainder = value.slice(1);
  return FORMULA_TRIGGER.test(remainder) ||
    (remainder.startsWith("-") && !PLAIN_NUMBER.test(remainder))
    ? remainder
    : value;
}

export function encodeCsv(rows: readonly (readonly string[])[]): string {
  return `${rows.map((row) => row.map(encodeCell).join(",")).join("\r\n")}\r\n`;
}

function encodeCell(raw: string): string {
  const cell = protectCell(raw);
  if (/[",\r\n]/.test(cell) || cell !== cell.trim()) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
}

export function decodeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((candidate) => candidate.some((value) => value !== ""));
}

export function transactionsToCsv(
  transactions: readonly Transaction[],
  tags: readonly Tag[],
): string {
  const namesById = new Map(tags.map((tag) => [tag.id, tag.name]));
  return encodeCsv([
    [...TRANSACTION_CSV_HEADER],
    ...transactions.map((transaction) => [
      transaction.id,
      transaction.accountId,
      transaction.bookingDate,
      transaction.valueDate ?? "",
      formatMinorToAmount(transaction.amountMinor, transaction.currency),
      transaction.currency,
      transaction.payee ?? "",
      transaction.description ?? "",
      transaction.userNote ?? "",
      transaction.status,
      transaction.source,
      transaction.tagIds
        .map((id) => namesById.get(id) ?? "")
        .filter(Boolean)
        .join("|"),
    ]),
  ]);
}

export function accountsToCsv(accounts: readonly Account[]): string {
  return encodeCsv([
    [...ACCOUNT_CSV_HEADER],
    ...accounts.map((account) => [
      account.id,
      account.name,
      account.type,
      account.defaultCurrency,
      account.institutionName ?? "",
      account.openingBalanceMinor === undefined
        ? ""
        : formatMinorToAmount(account.openingBalanceMinor, account.defaultCurrency),
      account.archivedAt ?? "",
    ]),
  ]);
}

export function tagsToCsv(tags: readonly Tag[]): string {
  return encodeCsv([
    [...TAG_CSV_HEADER],
    ...tags.map((tag) => [tag.id, tag.name, tag.normalizedName, tag.color ?? ""]),
  ]);
}

/**
 * Tagging rules are nested, so the conditions travel as one JSON cell and stay
 * lossless while the file remains readable in a spreadsheet.
 */
export function taggingRulesToCsv(rules: readonly TaggingRule[], tags: readonly Tag[]): string {
  const namesById = new Map(tags.map((tag) => [tag.id, tag.name]));
  return encodeCsv([
    [...TAGGING_RULE_CSV_HEADER],
    ...rules.map((rule) => [
      rule.id,
      rule.name,
      String(rule.enabled),
      rule.combinator,
      JSON.stringify(rule.conditions),
      rule.tagIds.map((id) => namesById.get(id) ?? id).join("|"),
      rule.createdAt,
      rule.updatedAt,
    ]),
  ]);
}

export interface ParsedCsvRow {
  line: number;
  value: Omit<Transaction, "revision" | "createdAt" | "updatedAt" | "tagIds"> & {
    tagNames: string[];
  };
}

export interface CsvParseError {
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: ParsedCsvRow[];
  errors: CsvParseError[];
}

/** Parses a transaction CSV into domain-shaped rows, reporting bad lines. */
export function parseTransactionCsv(text: string, generateId: () => string): CsvParseResult {
  const raw = decodeCsv(text);
  const header = raw.shift();
  if (!header) {
    return { rows: [], errors: [{ line: 1, message: "the CSV is empty" }] };
  }
  const columns = new Map(header.map((name, index) => [name.trim(), index]));
  const required = ["account_id", "booking_date", "amount", "currency"];
  const missing = required.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    return { rows: [], errors: [{ line: 1, message: `missing columns: ${missing.join(", ")}` }] };
  }

  const rows: ParsedCsvRow[] = [];
  const errors: CsvParseError[] = [];

  raw.forEach((cells, index) => {
    const line = index + 2;
    const read = (column: string): string => {
      const position = columns.get(column);
      return position === undefined ? "" : unprotectCell(cells[position] ?? "");
    };
    try {
      const currency = read("currency");
      const amountMinor = parseAmountToMinor(read("amount"), currency);
      const bookingDate = read("booking_date");
      assertIsoDate(bookingDate, "booking_date");
      const status = (read("status") || "booked") as TransactionStatus;
      if (status !== "booked" && status !== "pending") {
        throw new DomainError("invalid-value", `unsupported status: ${status}`);
      }
      const source = (read("source") || "csv-import") as TransactionSource;
      const rawId = read("id");
      const valueDate = read("value_date");
      if (valueDate) assertIsoDate(valueDate, "value_date");
      const accountId = read("account_id");
      assertUuid(accountId, "account_id");
      const payee = read("payee");
      const description = read("description");
      const userNote = read("user_note");
      rows.push({
        line,
        value: {
          formatVersion: 1,
          id: isUuid(rawId) ? rawId : generateId(),
          accountId,
          bookingDate,
          amountMinor,
          currency,
          status,
          source,
          ...(valueDate ? { valueDate } : {}),
          ...(payee ? { payee } : {}),
          ...(description ? { description } : {}),
          ...(userNote ? { userNote } : {}),
          tagNames: read("tags")
            .split("|")
            .map((name) => name.trim())
            .filter((name) => name !== ""),
        },
      });
    } catch (error) {
      errors.push({ line, message: error instanceof Error ? error.message : "invalid row" });
    }
  });

  return { rows, errors };
}

export function parseAccountsCsv(text: string): Account[] {
  const rows = decodeCsv(text);
  rows.shift();
  return rows.map((cells) => {
    const now = new Date().toISOString();
    const institutionName = cells[4] ?? "";
    const openingBalance = cells[5] ?? "";
    const archivedAt = cells[6] ?? "";
    const defaultCurrency = cells[3] ?? "EUR";
    return {
      formatVersion: 1,
      revision: 1,
      id: cells[0] ?? "",
      name: cells[1] ?? "",
      type: (cells[2] ?? "other") as Account["type"],
      defaultCurrency,
      ...(institutionName ? { institutionName } : {}),
      ...(openingBalance
        ? { openingBalanceMinor: parseAmountToMinor(openingBalance, defaultCurrency) }
        : {}),
      ...(archivedAt ? { archivedAt } : {}),
      createdAt: now,
      updatedAt: now,
    } satisfies Account;
  });
}

export function parseTagsCsv(text: string): Tag[] {
  const rows = decodeCsv(text);
  rows.shift();
  return rows.map((cells) => {
    const now = new Date().toISOString();
    const name = cells[1] ?? "";
    const color = cells[3] ?? "";
    return {
      formatVersion: 1,
      revision: 1,
      id: cells[0] ?? "",
      name,
      normalizedName: cells[2] || normalizeTagName(name),
      ...(color ? { color } : {}),
      createdAt: now,
      updatedAt: now,
    } satisfies Tag;
  });
}
