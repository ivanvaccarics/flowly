import type { Account, Tag, Transaction } from "../domain/types.ts";
import { FlowlySpikeError } from "../errors.ts";
import { formatMinorToAmount, parseAmountToMinor } from "./money.ts";

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

/**
 * Spreadsheet formula-injection mitigation. Plain numbers (including negative
 * amounts) stay untouched so CSV importers keep working.
 */
export function protectCell(cell: string): string {
  if (!/^[=+@\t\r]/.test(cell) && !/^-(?!\d+(?:\.\d+)?$)/.test(cell)) {
    return cell;
  }
  return `'${cell}`;
}

export function encodeCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(encodeCell).join(",")).join("\r\n") + "\r\n";
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

  return rows;
}

export function transactionsToCsv(
  transactions: readonly Transaction[],
  accounts: readonly Account[] = [],
  tags: readonly Tag[] = [],
): string {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));
  const rows: string[][] = [[...TRANSACTION_CSV_HEADER]];
  for (const transaction of transactions) {
    rows.push([
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
      transaction.tagIds.map((id) => tagNames.get(id) ?? id).join("|"),
    ]);
  }
  void accountNames;
  return encodeCsv(rows);
}

export function transactionsFromCsv(text: string): Transaction[] {
  const rows = decodeCsv(text);
  const header = rows.shift();
  if (!header) throw new FlowlySpikeError("transaction CSV is empty");
  const index = new Map(header.map((name, position) => [name, position]));
  for (const required of ["id", "account_id", "booking_date", "amount", "currency"]) {
    if (!index.has(required)) {
      throw new FlowlySpikeError(`transaction CSV is missing the ${required} column`);
    }
  }

  return rows
    .filter((row) => row.length > 1 || (row[0] ?? "") !== "")
    .map((row) => {
      const currency = cell(row, index, "currency");
      const userNote = cell(row, index, "user_note");
      const payee = cell(row, index, "payee");
      const description = cell(row, index, "description");
      const valueDate = cell(row, index, "value_date");
      const status = cell(row, index, "status") || "booked";
      const source = cell(row, index, "source") || "csv-import";
      if (status !== "pending" && status !== "booked") {
        throw new FlowlySpikeError(`invalid transaction status: ${status}`);
      }
      return {
        id: cell(row, index, "id"),
        accountId: cell(row, index, "account_id"),
        bookingDate: cell(row, index, "booking_date"),
        ...(valueDate ? { valueDate } : {}),
        amountMinor: parseAmountToMinor(cell(row, index, "amount"), currency),
        currency,
        ...(payee ? { payee } : {}),
        ...(description ? { description } : {}),
        ...(userNote ? { userNote } : {}),
        status,
        source: source as Transaction["source"],
        tagIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies Transaction;
    });
}

function cell(row: string[], index: Map<string, number>, name: string): string {
  const position = index.get(name);
  if (position === undefined) return "";
  return (row[position] ?? "").replace(/^'/, "");
}
