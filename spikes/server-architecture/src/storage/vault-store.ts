import { statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { deriveSubkey, SUBKEY_INFO } from "../crypto/envelope.ts";
import { decryptRecord, encryptRecord } from "../crypto/record-crypto.ts";
import { MIGRATIONS, runMigrations, type MigrationHooks } from "./migrations.ts";
import { SqlcipherDatabase } from "./sql.ts";

export type VaultTable = "accounts" | "transactions" | "tags" | "tagging_rules";

export const VAULT_TABLES: readonly VaultTable[] = [
  "accounts",
  "transactions",
  "tags",
  "tagging_rules",
];

export interface RecordRefs {
  refA?: string;
  refB?: string;
}

export interface VaultStore {
  readonly engine: "sqlcipher" | "record-encryption";
  readonly details: Readonly<Record<string, string>>;
  migrate(hooks?: MigrationHooks): Promise<number[]>;
  appliedMigrations(): Promise<number[]>;
  pendingMigrations(): Promise<number[]>;
  upsert(table: VaultTable, id: string, value: unknown, refs?: RecordRefs): Promise<void>;
  get<T>(table: VaultTable, id: string): Promise<T | undefined>;
  list<T>(table: VaultTable): Promise<T[]>;
  remove(table: VaultTable, id: string): Promise<void>;
  count(table: VaultTable): Promise<number>;
  replaceAll(data: Partial<Record<VaultTable, unknown[]>>): Promise<void>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
  bytesOnDisk(): number;
  close(): Promise<void>;
}

interface StoredRow {
  id: string;
  updated_at: string;
  ref_a: string | null;
  ref_b: string | null;
  payload: string | Buffer;
}

function updatedAtOf(value: unknown): string {
  if (value && typeof value === "object" && "updatedAt" in value) {
    const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
    if (typeof updatedAt === "string") return updatedAt;
  }
  return new Date().toISOString();
}

function refsOf(value: unknown, refs?: RecordRefs): [string | null, string | null] {
  const record = (value ?? {}) as Record<string, unknown>;
  const refA = refs?.refA ?? (typeof record.accountId === "string" ? record.accountId : null);
  const refB = refs?.refB ?? (typeof record.bookingDate === "string" ? record.bookingDate : null);
  return [refA, refB];
}

/** Whole-database encryption through SQLCipher 4. */
export class SqlcipherVaultStore implements VaultStore {
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

  static async open(file: string, dek: Buffer): Promise<SqlcipherVaultStore> {
    const db = await SqlcipherDatabase.open(file, { rawKey: dek });
    return new SqlcipherVaultStore(db, file);
  }

  migrate(hooks: MigrationHooks = {}): Promise<number[]> {
    return runMigrations(this.db, undefined, hooks);
  }

  async appliedMigrations(): Promise<number[]> {
    const rows = await this.db.all<{ version: number }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    return rows.map((row) => row.version);
  }

  async pendingMigrations(): Promise<number[]> {
    const rows = await this.db.all<{ version: number }>("SELECT version FROM schema_migrations");
    const applied = new Set(rows.map((row) => row.version));
    return MIGRATIONS.filter((migration) => !applied.has(migration.version)).map(
      (migration) => migration.version,
    );
  }

  async upsert(table: VaultTable, id: string, value: unknown, refs?: RecordRefs): Promise<void> {
    const [refA, refB] = refsOf(value, refs);
    await this.db.run(
      `INSERT INTO ${table}(id, updated_at, ref_a, ref_b, payload) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at,
         ref_a = excluded.ref_a, ref_b = excluded.ref_b, payload = excluded.payload`,
      [id, updatedAtOf(value), refA, refB, JSON.stringify(value)],
    );
  }

  async get<T>(table: VaultTable, id: string): Promise<T | undefined> {
    const row = await this.db.getRow<StoredRow>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!row) return undefined;
    return JSON.parse(String(row.payload)) as T;
  }

  async list<T>(table: VaultTable): Promise<T[]> {
    const rows = await this.db.all<StoredRow>(`SELECT * FROM ${table}`);
    return rows.map((row) => JSON.parse(String(row.payload)) as T);
  }

  async remove(table: VaultTable, id: string): Promise<void> {
    await this.db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
  }

  async count(table: VaultTable): Promise<number> {
    const row = await this.db.getRow<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
    return row?.n ?? 0;
  }

  async replaceAll(data: Partial<Record<VaultTable, unknown[]>>): Promise<void> {
    await this.transaction(async () => {
      for (const table of VAULT_TABLES) {
        await this.db.run(`DELETE FROM ${table}`);
        for (const value of data[table] ?? []) {
          const id = (value as { id?: string }).id;
          if (!id) throw new Error(`record in ${table} is missing an id`);
          await this.upsert(table, id, value);
        }
      }
    });
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    await this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await work();
      await this.db.exec("COMMIT");
      return result;
    } catch (error) {
      await this.db.exec("ROLLBACK");
      throw error;
    }
  }

  bytesOnDisk(): number {
    return fileSize(this.file);
  }

  close(): Promise<void> {
    return this.db.close();
  }
}

/**
 * Fallback path: an unencrypted SQLite file whose payloads are individually
 * encrypted with AES-256-GCM. Used when SQLCipher cannot be built on a host.
 */
export class RecordEncryptionVaultStore implements VaultStore {
  readonly engine = "record-encryption" as const;
  readonly details: Readonly<Record<string, string>>;

  private readonly db: DatabaseSync;
  private readonly file: string;
  private readonly recordKey: Buffer;

  private constructor(db: DatabaseSync, file: string, recordKey: Buffer) {
    this.db = db;
    this.file = file;
    this.recordKey = recordKey;
    this.details = {
      driver: `node:sqlite ${process.versions.node}`,
      cipher: "AES-256-GCM per record (HKDF-SHA256 subkey)",
      scope: "record payloads; ids, dates and the SQLite structure stay visible",
    };
  }

  static async open(file: string, dek: Buffer): Promise<RecordEncryptionVaultStore> {
    const db = new DatabaseSync(file);
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA journal_mode = WAL");
    return new RecordEncryptionVaultStore(db, file, deriveSubkey(dek, SUBKEY_INFO.records));
  }

  private executor() {
    const db = this.db;
    return {
      exec: async (sql: string) => void db.exec(sql),
      run: async (sql: string, params: unknown[] = []) =>
        void db.prepare(sql).run(...(params as never[])),
      all: async <T>(sql: string, params: unknown[] = []) =>
        db.prepare(sql).all(...(params as never[])) as T[],
    };
  }

  migrate(hooks: MigrationHooks = {}): Promise<number[]> {
    return runMigrations(this.executor(), undefined, hooks);
  }

  async appliedMigrations(): Promise<number[]> {
    const rows = this.db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all() as Array<{ version: number }>;
    return rows.map((row) => row.version);
  }

  async pendingMigrations(): Promise<number[]> {
    const applied = new Set(await this.appliedMigrations());
    return MIGRATIONS.filter((migration) => !applied.has(migration.version)).map(
      (migration) => migration.version,
    );
  }

  async upsert(table: VaultTable, id: string, value: unknown, refs?: RecordRefs): Promise<void> {
    const [refA, refB] = refsOf(value, refs);
    const payload = encryptRecord(this.recordKey, recordAad(table, id), value);
    this.db
      .prepare(
        `INSERT INTO ${table}(id, updated_at, ref_a, ref_b, payload) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at,
           ref_a = excluded.ref_a, ref_b = excluded.ref_b, payload = excluded.payload`,
      )
      .run(id, updatedAtOf(value), refA, refB, payload);
  }

  async get<T>(table: VaultTable, id: string): Promise<T | undefined> {
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
      | StoredRow
      | undefined;
    if (!row) return undefined;
    return decryptRecord<T>(this.recordKey, recordAad(table, id), toBuffer(row.payload));
  }

  async list<T>(table: VaultTable): Promise<T[]> {
    const rows = this.db.prepare(`SELECT * FROM ${table}`).all() as unknown as StoredRow[];
    return rows.map((row) =>
      decryptRecord<T>(this.recordKey, recordAad(table, row.id), toBuffer(row.payload)),
    );
  }

  async remove(table: VaultTable, id: string): Promise<void> {
    this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  }

  async count(table: VaultTable): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as
      | { n: number }
      | undefined;
    return row?.n ?? 0;
  }

  async replaceAll(data: Partial<Record<VaultTable, unknown[]>>): Promise<void> {
    await this.transaction(async () => {
      for (const table of VAULT_TABLES) {
        this.db.prepare(`DELETE FROM ${table}`).run();
        for (const value of data[table] ?? []) {
          const id = (value as { id?: string }).id;
          if (!id) throw new Error(`record in ${table} is missing an id`);
          await this.upsert(table, id, value);
        }
      }
    });
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  bytesOnDisk(): number {
    return fileSize(this.file);
  }

  async close(): Promise<void> {
    this.db.close();
    this.recordKey.fill(0);
  }
}

function recordAad(table: VaultTable, id: string): string {
  return `flowly/record/${table}/${id}`;
}

function toBuffer(payload: string | Buffer): Buffer {
  return Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
}

function fileSize(file: string): number {
  let total = 0;
  for (const candidate of [file, `${file}-wal`, `${file}-shm`]) {
    try {
      total += statSync(candidate).size;
    } catch {
      // The side files only exist while the database is open in WAL mode.
    }
  }
  return total;
}
