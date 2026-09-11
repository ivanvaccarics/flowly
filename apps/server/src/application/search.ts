import type { Transaction, TransactionSource, TransactionStatus } from "../domain/transaction.js";
import { normalizeText } from "../domain/values.js";
import type { Vault } from "../vault/vault.js";

export interface TransactionQuery {
  accountId?: string;
  fromDate?: string;
  toDate?: string;
  tagIds?: string[];
  currency?: string;
  status?: TransactionStatus;
  source?: TransactionSource;
  minAmountMinor?: number;
  maxAmountMinor?: number;
  text?: string;
  limit?: number;
  offset?: number;
}

export interface TransactionSearchResult {
  items: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export const DEFAULT_SEARCH_LIMIT = 100;
export const MAX_SEARCH_LIMIT = 500;

/** Turns HTTP query parameters into a validated transaction query. */
export function parseTransactionQuery(query: Record<string, unknown>): TransactionQuery {
  const result: TransactionQuery = {};
  const string = (key: string): string | undefined => {
    const value = query[key];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
  };
  const number = (key: string): number | undefined => {
    const value = query[key];
    if (typeof value !== "string" || value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  };

  const accountId = string("accountId");
  if (accountId) result.accountId = accountId;
  const fromDate = string("from");
  if (fromDate) result.fromDate = fromDate;
  const toDate = string("to");
  if (toDate) result.toDate = toDate;
  const tags = string("tags");
  if (tags)
    result.tagIds = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  const currency = string("currency");
  if (currency) result.currency = currency;
  const status = string("status");
  if (status === "booked" || status === "pending") result.status = status;
  const source = string("source");
  if (source) result.source = source as TransactionSource;
  const min = number("minAmountMinor");
  if (min !== undefined) result.minAmountMinor = min;
  const max = number("maxAmountMinor");
  if (max !== undefined) result.maxAmountMinor = max;
  const text = string("q");
  if (text) result.text = text;
  const limit = number("limit");
  if (limit !== undefined && limit > 0) result.limit = Math.min(limit, MAX_SEARCH_LIMIT);
  const offset = number("offset");
  if (offset !== undefined && offset >= 0) result.offset = offset;
  return result;
}

export function matchesQuery(transaction: Transaction, query: TransactionQuery): boolean {
  if (query.accountId && transaction.accountId !== query.accountId) return false;
  if (query.fromDate && transaction.bookingDate < query.fromDate) return false;
  if (query.toDate && transaction.bookingDate > query.toDate) return false;
  if (query.currency && transaction.currency !== query.currency) return false;
  if (query.status && transaction.status !== query.status) return false;
  if (query.source && transaction.source !== query.source) return false;
  if (query.minAmountMinor !== undefined && transaction.amountMinor < query.minAmountMinor)
    return false;
  if (query.maxAmountMinor !== undefined && transaction.amountMinor > query.maxAmountMinor)
    return false;
  if (query.tagIds && query.tagIds.length > 0) {
    if (!query.tagIds.every((tagId) => transaction.tagIds.includes(tagId))) return false;
  }
  if (query.text) {
    const needle = normalizeText(query.text);
    if (needle !== "") {
      const haystack = normalizeText(
        [transaction.payee, transaction.description, transaction.userNote]
          .filter((value): value is string => typeof value === "string")
          .join(" "),
      );
      if (!haystack.includes(needle)) return false;
    }
  }
  return true;
}

/** Deterministic ordering: newest booking date first, then id. */
export function compareTransactions(a: Transaction, b: Transaction): number {
  if (a.bookingDate !== b.bookingDate) return a.bookingDate < b.bookingDate ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export class TransactionSearchService {
  private readonly vault: Vault;

  constructor(vault: Vault) {
    this.vault = vault;
  }

  async search(query: TransactionQuery = {}): Promise<TransactionSearchResult> {
    // Narrow in SQL on the indexed columns, then filter the rest in memory.
    const candidates = await this.vault.transactions.list({
      ...(query.accountId ? { refA: query.accountId } : {}),
      ...(query.fromDate ? { refBFrom: query.fromDate } : {}),
      ...(query.toDate ? { refBTo: query.toDate } : {}),
    });
    const matched = candidates.filter((transaction) => matchesQuery(transaction, query));
    matched.sort(compareTransactions);
    const limit = query.limit ?? DEFAULT_SEARCH_LIMIT;
    const offset = query.offset ?? 0;
    return {
      items: matched.slice(offset, offset + limit),
      total: matched.length,
      limit,
      offset,
    };
  }
}
