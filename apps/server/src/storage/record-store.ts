import type { DatabaseSync } from "node:sqlite";
import { deriveSubkey, SUBKEY_INFO } from "../crypto/envelope.js";
import { decryptRecord, encryptRecord } from "../crypto/record-crypto.js";
import { ConflictError, RecordExistsError, RecordNotFoundError, StorageError } from "./errors.js";
import {
  MIGRATIONS,
  runMigrations,
  type AsyncSqlExecutor,
  type MigrationHooks,
} from "./migrations.js";
import { fileSize, updatedAtOf } from "./sqlcipher-store.js";
import type { ListOptions, StoredRefs, VaultStore } from "./store.js";
import { createTransactionRunner } from "./transaction-scope.js";

type NodeSqlite = { DatabaseSync: new (path: string) => DatabaseSync };

interface StoredRow {
  id: string;
  updated_at: string;
  revision: number;
  ref_a: string | null;
  ref_b: string | null;
  payload: Uint8Array;
}

/**
 * Fallback engine (ADR 0001): an unencrypted SQLite file whose payloads are
 * individually sealed with AES-256-GCM. It needs Node's `--experimental-sqlite`
 * flag, so it is loaded lazily and never on the default SQLCipher path.
 */
export class RecordEncryptionStore implements VaultStore {
  readonly engine = "record-encryption" as const;
  readonly details: Readonly<Record<string, string>>;

  private readonly db: DatabaseSync;
  private readonly file: string;
  private readonly recordKey: Buffer;
  private readonly txRunner: <T>(work: () => Promise<T>) => Promise<T>;

  private constructor(db: DatabaseSync, file: string, recordKey: Buffer) {
    this.db = db;
    this.file = file;
    this.recordKey = recordKey;
    this.txRunner = createTransactionRunner({
      exec: async (sql: string) => void this.db.exec(sql),
    });
    this.details = {
      driver: `node:sqlite ${process.versions.node}`,
      cipher: "AES-256-GCM per record (HKDF-SHA256 subkey)",
      scope: "record payloads; ids, dates and the SQLite structure stay visible",
    };
  }

  static async open(file: string, dek: Buffer): Promise<RecordEncryptionStore> {
    let sqlite: NodeSqlite;
    try {
      sqlite = await import("node:sqlite");
    } catch (error) {
      throw new StorageError(
        "the record-encryption engine needs Node's --experimental-sqlite flag",
        { cause: error },
      );
    }
    const db = new sqlite.DatabaseSync(file);
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA journal_mode = WAL");
    return new RecordEncryptionStore(db, file, deriveSubkey(dek, SUBKEY_INFO.records));
  }

  private executor(): AsyncSqlExecutor {
    return {
      exec: async (sql: string) => void this.db.exec(sql),
      run: async (sql: string, params: unknown[] = []) =>
        void this.db.prepare(sql).run(...(params as never[])),
      all: async <T>(sql: string, params: unknown[] = []) =>
        this.db.prepare(sql).all(...(params as never[])) as T[],
    };
  }

  migrate(hooks: MigrationHooks = {}): Promise<number[]> {
    return runMigrations(this.executor(), MIGRATIONS, hooks);
  }

  async appliedMigrations(): Promise<number[]> {
    const rows = this.db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all() as unknown as Array<{ version: number }>;
    return rows.map((row) => row.version);
  }

  async insert(table: string, id: string, value: unknown, refs: StoredRefs = {}): Promise<void> {
    try {
      this.db
        .prepare(
          `INSERT INTO ${table}(id, updated_at, revision, ref_a, ref_b, payload)
           VALUES (?, ?, 1, ?, ?, ?)`,
        )
        .run(
          id,
          updatedAtOf(value),
          refs.refA ?? null,
          refs.refB ?? null,
          encryptRecord(this.recordKey, recordAad(table, id), value),
        );
    } catch (error) {
      if (isConstraintViolation(error)) throw new RecordExistsError(table, id);
      throw error;
    }
  }

  async read<T>(table: string, id: string): Promise<T | undefined> {
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
      StoredRow | undefined;
    return row ? decodeRow<T>(this.recordKey, table, row) : undefined;
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
    const rows = this.db
      .prepare(`SELECT * FROM ${table}${where} ORDER BY updated_at DESC, id${limit}`)
      .all(...(params as never[])) as unknown as StoredRow[];
    return rows.map((row) => decodeRow<T>(this.recordKey, table, row));
  }

  async replace(
    table: string,
    id: string,
    value: unknown,
    expectedRevision: number,
    refs: StoredRefs = {},
  ): Promise<number> {
    return this.transaction(async () => {
      const current = this.currentRevision(table, id);
      if (current !== expectedRevision) {
        throw new ConflictError(table, id, expectedRevision, current);
      }
      this.db
        .prepare(
          `UPDATE ${table} SET updated_at = ?, revision = ?, ref_a = ?, ref_b = ?, payload = ?
           WHERE id = ?`,
        )
        .run(
          updatedAtOf(value),
          current + 1,
          refs.refA ?? null,
          refs.refB ?? null,
          encryptRecord(this.recordKey, recordAad(table, id), value),
          id,
        );
      return current + 1;
    });
  }

  async remove(table: string, id: string, expectedRevision: number): Promise<void> {
    await this.transaction(async () => {
      const current = this.currentRevision(table, id);
      if (current !== expectedRevision) {
        throw new ConflictError(table, id, expectedRevision, current);
      }
      this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    });
  }

  async count(table: string): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as
      { n: number } | undefined;
    return row?.n ?? 0;
  }

  async clear(table: string): Promise<void> {
    this.db.prepare(`DELETE FROM ${table}`).run();
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.txRunner(work);
  }

  bytesOnDisk(): number {
    return fileSize(this.file);
  }

  async checkpoint(): Promise<void> {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  }

  async close(): Promise<void> {
    this.db.close();
    this.recordKey.fill(0);
  }

  private currentRevision(table: string, id: string): number {
    const row = this.db.prepare(`SELECT revision FROM ${table} WHERE id = ?`).get(id) as
      { revision: number } | undefined;
    if (!row) throw new RecordNotFoundError(table, id);
    return row.revision;
  }
}

function recordAad(table: string, id: string): string {
  return `flowly/record/${table}/${id}`;
}

function decodeRow<T>(key: Buffer, table: string, row: StoredRow): T {
  const value = decryptRecord<T>(key, recordAad(table, row.id), Buffer.from(row.payload));
  return { ...(value as Record<string, unknown>), revision: row.revision } as T;
}

function isConstraintViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /UNIQUE constraint failed|constraint failed/i.test(message);
}
