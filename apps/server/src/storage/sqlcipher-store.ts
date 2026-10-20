import { statSync } from "node:fs";
import { RecordExistsError, RecordNotFoundError } from "./errors.js";
import { MIGRATIONS, runMigrations, type MigrationHooks } from "./migrations.js";
import { SqlcipherDatabase } from "./sqlcipher-driver.js";
import {
  assertExpectedRevision,
  clearStatement,
  countStatement,
  deleteStatement,
  insertStatement,
  listStatement,
  readStatement,
  replaceStatement,
  revisionStatement,
  statsStatement,
} from "./sql.js";
import type { ListOptions, StoredRefs, TableStats, VaultStore, VaultTable } from "./store.js";
import { createTransactionRunner } from "./transaction-scope.js";

interface StoredRow {
  id: string;
  updated_at: string;
  revision: number;
  ref_a: string | null;
  ref_b: string | null;
  payload: string | Buffer;
}

/** Whole-database encryption through SQLCipher 4 (ADR 0001). */
export class SqlcipherStore implements VaultStore {
  readonly engine = "sqlcipher" as const;
  readonly details: Readonly<Record<string, string>>;

  private readonly db: SqlcipherDatabase;
  private readonly file: string;
  private readonly txRunner: <T>(work: () => Promise<T>) => Promise<T>;

  private constructor(db: SqlcipherDatabase, file: string) {
    this.db = db;
    this.file = file;
    this.txRunner = createTransactionRunner(db);
    this.details = {
      driver: `@journeyapps/sqlcipher ${db.driverVersion}`,
      cipher: `SQLCipher ${db.cipherVersion}`,
      scope: "whole database file, including WAL and indices",
    };
  }

  static async open(file: string, dek: Buffer): Promise<SqlcipherStore> {
    const db = await SqlcipherDatabase.open(file, dek);
    return new SqlcipherStore(db, file);
  }

  migrate(hooks: MigrationHooks = {}): Promise<number[]> {
    return runMigrations(this.db, MIGRATIONS, hooks);
  }

  async appliedMigrations(): Promise<number[]> {
    const rows = await this.db.all<{ version: number }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    return rows.map((row) => row.version);
  }

  async insert(
    table: VaultTable,
    id: string,
    value: unknown,
    refs: StoredRefs = {},
  ): Promise<void> {
    try {
      await this.db.run(insertStatement(table), [
        id,
        updatedAtOf(value),
        refs.refA ?? null,
        refs.refB ?? null,
        JSON.stringify(value),
      ]);
    } catch (error) {
      if (isConstraintViolation(error)) throw new RecordExistsError(table, id);
      throw error;
    }
  }

  async read<T>(table: VaultTable, id: string): Promise<T | undefined> {
    const row = await this.db.getRow<StoredRow>(readStatement(table), [id]);
    return row ? decodeRow<T>(row) : undefined;
  }

  async list<T>(table: VaultTable, options: ListOptions = {}): Promise<T[]> {
    const query = listStatement(table, options);
    const rows = await this.db.all<StoredRow>(query.sql, query.params);
    return rows.map((row) => decodeRow<T>(row));
  }

  async replace(
    table: VaultTable,
    id: string,
    value: unknown,
    expectedRevision: number,
    refs: StoredRefs = {},
  ): Promise<number> {
    return this.transaction(async () => {
      const current = await this.currentRevision(table, id);
      assertExpectedRevision(table, id, expectedRevision, current);
      const query = replaceStatement(
        table,
        id,
        current + 1,
        refs,
        JSON.stringify(value),
        updatedAtOf(value),
      );
      await this.db.run(query.sql, query.params);
      return current + 1;
    });
  }

  async remove(table: VaultTable, id: string, expectedRevision: number): Promise<void> {
    await this.transaction(async () => {
      const current = await this.currentRevision(table, id);
      assertExpectedRevision(table, id, expectedRevision, current);
      const query = deleteStatement(table, id);
      await this.db.run(query.sql, query.params);
    });
  }

  async count(table: VaultTable): Promise<number> {
    const row = await this.db.getRow<{ n: number }>(countStatement(table));
    return row?.n ?? 0;
  }

  async tableStats(table: VaultTable): Promise<TableStats> {
    const row = await this.db.getRow<{ n: number; m: string | null }>(statsStatement(table));
    return { count: row?.n ?? 0, updatedAtMax: row?.m ?? null };
  }

  async clear(table: VaultTable): Promise<void> {
    await this.db.run(clearStatement(table));
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.txRunner(work);
  }

  bytesOnDisk(): number {
    return fileSize(this.file);
  }

  async checkpoint(): Promise<void> {
    await this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  close(): Promise<void> {
    return this.db.close();
  }

  private async currentRevision(table: VaultTable, id: string): Promise<number> {
    const row = await this.db.getRow<{ revision: number }>(revisionStatement(table), [id]);
    if (!row) throw new RecordNotFoundError(table, id);
    return row.revision;
  }
}

function decodeRow<T>(row: StoredRow): T {
  const payload = JSON.parse(String(row.payload)) as Record<string, unknown>;
  return { ...payload, revision: row.revision } as T;
}

export function updatedAtOf(value: unknown): string {
  if (value && typeof value === "object" && "updatedAt" in value) {
    const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
    if (typeof updatedAt === "string") return updatedAt;
  }
  return new Date().toISOString();
}

function isConstraintViolation(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code ?? "";
  const message = error instanceof Error ? error.message : "";
  return code.includes("CONSTRAINT") || /UNIQUE constraint failed/i.test(message);
}

export function fileSize(file: string): number {
  let total = 0;
  for (const candidate of [file, `${file}-wal`, `${file}-shm`]) {
    try {
      total += statSync(candidate).size;
    } catch {
      // WAL side files only exist while the database is open.
    }
  }
  return total;
}
