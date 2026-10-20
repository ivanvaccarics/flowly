import { ConflictError } from "./errors.js";
import type { ListOptions, VaultTable } from "./store.js";

export interface SqlStatement {
  sql: string;
  params: unknown[];
}

export function insertStatement(table: VaultTable): string {
  return `INSERT INTO ${table}(id, updated_at, revision, ref_a, ref_b, payload)
          VALUES (?, ?, 1, ?, ?, ?)`;
}

export function readStatement(table: VaultTable): string {
  return `SELECT * FROM ${table} WHERE id = ?`;
}

export function listStatement(table: VaultTable, options: ListOptions): SqlStatement {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.refA !== undefined) {
    clauses.push("ref_a = ?");
    params.push(options.refA);
  }
  if (options.refBFrom !== undefined) {
    clauses.push("ref_b >= ?");
    params.push(options.refBFrom);
  }
  if (options.refBTo !== undefined) {
    clauses.push("ref_b <= ?");
    params.push(options.refBTo);
  }
  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const limit = options.limit !== undefined ? " LIMIT ?" : "";
  if (options.limit !== undefined) params.push(options.limit);
  return { sql: `SELECT * FROM ${table}${where} ORDER BY updated_at DESC, id${limit}`, params };
}

export function replaceStatement(
  table: VaultTable,
  id: string,
  revision: number,
  refs: { refA?: string | null; refB?: string | null },
  payload: unknown,
  updatedAt: string,
): SqlStatement {
  return {
    sql: `UPDATE ${table} SET updated_at = ?, revision = ?, ref_a = ?, ref_b = ?, payload = ?
          WHERE id = ?`,
    params: [updatedAt, revision, refs.refA ?? null, refs.refB ?? null, payload, id],
  };
}

export function deleteStatement(table: VaultTable, id: string): SqlStatement {
  return { sql: `DELETE FROM ${table} WHERE id = ?`, params: [id] };
}

export function clearStatement(table: VaultTable): string {
  return `DELETE FROM ${table}`;
}

export function revisionStatement(table: VaultTable): string {
  return `SELECT revision FROM ${table} WHERE id = ?`;
}

export function countStatement(table: VaultTable): string {
  return `SELECT COUNT(*) AS n FROM ${table}`;
}

export function statsStatement(table: VaultTable): string {
  return `SELECT COUNT(*) AS n, MAX(updated_at) AS m FROM ${table}`;
}

export function assertExpectedRevision(
  table: VaultTable,
  id: string,
  expected: number,
  current: number,
): void {
  if (current !== expected) throw new ConflictError(table, id, expected, current);
}
