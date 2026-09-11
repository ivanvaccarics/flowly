import { statSync } from "node:fs";
import { ConflictError, RecordExistsError, RecordNotFoundError, StorageError } from "./errors.js";
import { MIGRATIONS, runMigrations, type MigrationHooks } from "./migrations.js";
import { SqlcipherDatabase } from "./sqlcipher-driver.js";
import type { ListOptions, StoredRefs, VaultStore } from "./store.js";

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

  private constructor(db: SqlcipherDatabase, file: string) {
    this.db = db;
    this.file = file;
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

  async insert(table: string, id: string, value: unknown, refs: StoredRefs = {}): Promise<void> {
    try {
      await this.db.run(
        `INSERT INTO ${table}(id, updated_at, revision, ref_a, ref_b, payload)
         VALUES (?, ?, 1, ?, ?, ?)`,
        [id, updatedAtOf(value), refs.refA ?? null, refs.refB ?? null, JSON.stringify(value)],
      );
    } catch (error) {
      if (isConstraintViolation(error)) throw new RecordExistsError(table, id);
      throw error;
    }
  }

  async read<T>(table: string, id: string): Promise<T | undefined> {
    const row = await this.db.getRow<StoredRow>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    return row ? decodeRow<T>(row) : undefined;
  }

  async list<T>(table: string, options: ListOptions = {}): Promise<T[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (options.refA !== undefined) {
      clauses.push("ref_a = ?");
      params.push(options.refA);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const limit = options.limit !== undefined ? " LIMIT ?" : "";
    if (options.limit !== undefined) params.push(options.limit);
    const rows = await this.db.all<StoredRow>(
      `SELECT * FROM ${table}${where} ORDER BY updated_at DESC, id${limit}`,
      params,
    );
    return rows.map((row) => decodeRow<T>(row));
  }

  async replace(
    table: string,
    id: string,
    value: unknown,
    expectedRevision: number,
    refs: StoredRefs = {},
  ): Promise<number> {
    return this.transaction(async () => {
      const current = await this.currentRevision(table, id);
      if (current !== expectedRevision) {
        throw new ConflictError(table, id, expectedRevision, current);
      }
      await this.db.run(
        `UPDATE ${table} SET updated_at = ?, revision = ?, ref_a = ?, ref_b = ?, payload = ?
         WHERE id = ?`,
        [
          updatedAtOf(value),
          current + 1,
          refs.refA ?? null,
          refs.refB ?? null,
          JSON.stringify(value),
          id,
        ],
      );
      return current + 1;
    });
  }

  async remove(table: string, id: string, expectedRevision: number): Promise<void> {
    await this.transaction(async () => {
      const current = await this.currentRevision(table, id);
      if (current !== expectedRevision) {
        throw new ConflictError(table, id, expectedRevision, current);
      }
      await this.db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
    });
  }

  async count(table: string): Promise<number> {
    const row = await this.db.getRow<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
    return row?.n ?? 0;
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    await this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await work();
      await this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        await this.db.exec("ROLLBACK");
      } catch {
        // The connection may already be unusable; the caller reports the error.
      }
      throw error;
    }
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

  private async currentRevision(table: string, id: string): Promise<number> {
    const row = await this.db.getRow<{ revision: number }>(
      `SELECT revision FROM ${table} WHERE id = ?`,
      [id],
    );
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

export function assertStorage(condition: unknown, message: string): asserts condition {
  if (!condition) throw new StorageError(message);
}
