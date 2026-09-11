import type { MigrationHooks } from "./migrations.js";
import { RecordEncryptionStore } from "./record-store.js";
import { SqlcipherStore } from "./sqlcipher-store.js";

export type StorageEngine = "sqlcipher" | "record-encryption";

export type VaultTable =
  | "accounts"
  | "transactions"
  | "tags"
  | "tagging_rules"
  | "settings"
  | "bank_connections"
  | "bank_links"
  | "bank_accounts"
  | "bank_payloads";

export const VAULT_TABLES: readonly VaultTable[] = [
  "accounts",
  "transactions",
  "tags",
  "tagging_rules",
  "settings",
  "bank_connections",
  "bank_links",
  "bank_accounts",
  "bank_payloads",
];

export interface StoredRefs {
  refA?: string | null;
  refB?: string | null;
}

export interface ListOptions {
  /** Filters on the non-sensitive `ref_a` index column. */
  refA?: string;
  /** Inclusive lower bound on the `ref_b` column (dates for transactions). */
  refBFrom?: string;
  /** Inclusive upper bound on the `ref_b` column. */
  refBTo?: string;
  limit?: number;
}

export interface TableStats {
  count: number;
  updatedAtMax: string | null;
}

export interface VaultStore {
  readonly engine: StorageEngine;
  readonly details: Readonly<Record<string, string>>;

  migrate(hooks?: MigrationHooks): Promise<number[]>;
  appliedMigrations(): Promise<number[]>;

  insert(table: VaultTable, id: string, value: unknown, refs?: StoredRefs): Promise<void>;
  read<T>(table: VaultTable, id: string): Promise<T | undefined>;
  list<T>(table: VaultTable, options?: ListOptions): Promise<T[]>;
  /** Writes with optimistic concurrency; returns the new revision. */
  replace(
    table: VaultTable,
    id: string,
    value: unknown,
    expectedRevision: number,
    refs?: StoredRefs,
  ): Promise<number>;
  remove(table: VaultTable, id: string, expectedRevision: number): Promise<void>;
  clear(table: VaultTable): Promise<void>;
  count(table: VaultTable): Promise<number>;
  /** Cheap aggregate used for cache keys; never loads payloads. */
  tableStats(table: VaultTable): Promise<TableStats>;

  transaction<T>(work: () => Promise<T>): Promise<T>;
  bytesOnDisk(): number;
  checkpoint(): Promise<void>;
  close(): Promise<void>;
}

export async function openStore(
  engine: StorageEngine,
  file: string,
  dek: Buffer,
): Promise<VaultStore> {
  return engine === "sqlcipher"
    ? SqlcipherStore.open(file, dek)
    : RecordEncryptionStore.open(file, dek);
}
