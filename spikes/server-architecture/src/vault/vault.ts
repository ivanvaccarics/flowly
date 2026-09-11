import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createVaultHeader,
  unlockVaultHeader,
  zeroize,
  type VaultHeader,
} from "../crypto/envelope.ts";
import { DEFAULT_KDF_PARAMS, type KdfParams } from "../crypto/kdf.ts";
import type { Account, Tag, TaggingRule, Transaction } from "../domain/types.ts";
import { VaultLockedError, VaultNotFoundError } from "../errors.ts";
import { readArchive, writeArchive, type ArchiveFile } from "../portability/archive.ts";
import { encodeCsv, decodeCsv, transactionsFromCsv, transactionsToCsv } from "../portability/csv.ts";
import type { MigrationHooks } from "../storage/migrations.ts";
import {
  RecordEncryptionVaultStore,
  SqlcipherVaultStore,
  type VaultStore,
} from "../storage/vault-store.ts";

export type StorageEngine = "sqlcipher" | "record-encryption";

export interface VaultOptions {
  engine?: StorageEngine;
  kdf?: KdfParams;
  autoMigrate?: boolean;
}

export interface VaultStats {
  engine: StorageEngine;
  details: Readonly<Record<string, string>>;
  schemaVersion: number;
  counts: Record<string, number>;
  bytesOnDisk: number;
}

const HEADER_FILE = "vault.json";
const DATABASE_FILE = "vault.db";

export function newId(): string {
  return randomUUID();
}

export class Vault {
  static readonly databaseFile = DATABASE_FILE;
  static readonly headerFile = HEADER_FILE;

  readonly path: string;
  readonly engine: StorageEngine;

  private readonly headerValue: VaultHeader;
  private dek: Buffer | null;
  private storeValue: VaultStore | null;

  private constructor(
    path: string,
    header: VaultHeader,
    dek: Buffer,
    store: VaultStore,
    engine: StorageEngine,
  ) {
    this.path = path;
    this.headerValue = header;
    this.dek = dek;
    this.storeValue = store;
    this.engine = engine;
  }

  static async create(path: string, passphrase: string, options: VaultOptions = {}): Promise<Vault> {
    if (existsSync(join(path, HEADER_FILE))) {
      throw new VaultLockedError(`a vault already exists at ${path}`);
    }
    mkdirSync(path, { recursive: true });
    mkdirSync(join(path, "snapshots"), { recursive: true });
    const { header, dek } = await createVaultHeader(passphrase, options.kdf ?? DEFAULT_KDF_PARAMS);
    writeFileSync(join(path, HEADER_FILE), `${JSON.stringify(header, null, 2)}\n`, { mode: 0o600 });
    const engine = options.engine ?? "sqlcipher";
    const store = await openStore(engine, join(path, DATABASE_FILE), dek);
    await store.migrate();
    return new Vault(path, header, dek, store, engine);
  }

  static async open(path: string, passphrase: string, options: VaultOptions = {}): Promise<Vault> {
    const headerPath = join(path, HEADER_FILE);
    if (!existsSync(headerPath)) {
      throw new VaultNotFoundError(`no vault found at ${path}`);
    }
    const header = JSON.parse(readFileSync(headerPath, "utf8")) as VaultHeader;
    const dek = await unlockVaultHeader(header, passphrase);
    const engine = options.engine ?? "sqlcipher";
    const store = await openStore(engine, join(path, DATABASE_FILE), dek);
    if (options.autoMigrate ?? true) {
      await store.migrate();
    }
    return new Vault(path, header, dek, store, engine);
  }

  static exists(path: string): boolean {
    return existsSync(join(path, HEADER_FILE));
  }

  static async destroy(path: string): Promise<void> {
    if (!existsSync(path)) return;
    rmSync(path, { recursive: true, force: true });
  }

  get header(): Readonly<VaultHeader> {
    return this.headerValue;
  }

  get isUnlocked(): boolean {
    return this.storeValue !== null && this.dek !== null;
  }

  async lock(): Promise<void> {
    if (this.storeValue) {
      await this.storeValue.close();
    }
    this.storeValue = null;
    if (this.dek) {
      zeroize(this.dek);
      this.dek = null;
    }
  }

  async migrate(hooks: MigrationHooks = {}): Promise<number[]> {
    return this.store().migrate(hooks);
  }

  async pendingMigrations(): Promise<number[]> {
    return this.store().pendingMigrations();
  }

  async appliedMigrations(): Promise<number[]> {
    return this.store().appliedMigrations();
  }

  async putAccount(account: Account): Promise<void> {
    await this.store().upsert("accounts", account.id, account);
  }

  async listAccounts(): Promise<Account[]> {
    return this.store().list<Account>("accounts");
  }

  async putTag(tag: Tag): Promise<void> {
    await this.store().upsert("tags", tag.id, tag);
  }

  async listTags(): Promise<Tag[]> {
    return this.store().list<Tag>("tags");
  }

  async putTaggingRule(rule: TaggingRule): Promise<void> {
    await this.store().upsert("tagging_rules", rule.id, rule);
  }

  async listTaggingRules(): Promise<TaggingRule[]> {
    return this.store().list<TaggingRule>("tagging_rules");
  }

  async putTransaction(transaction: Transaction): Promise<void> {
    await this.store().upsert("transactions", transaction.id, transaction, {
      refA: transaction.accountId,
      refB: transaction.bookingDate,
    });
  }

  async listTransactions(): Promise<Transaction[]> {
    return this.store().list<Transaction>("transactions");
  }

  /** Runs a multi-record write atomically; used by imports and bulk operations. */
  async transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.store().transaction(work);
  }

  async exportTransactionCsv(destination: string): Promise<{ rows: number; bytes: number }> {
    const transactions = await this.listTransactions();
    const csv = transactionsToCsv(transactions, await this.listAccounts(), await this.listTags());
    writeFileSync(destination, csv, "utf8");
    return { rows: transactions.length, bytes: Buffer.byteLength(csv, "utf8") };
  }

  async exportArchive(
    destination: string,
    archivePassword: string,
  ): Promise<{ bytes: number; files: string[] }> {
    const [accounts, transactions, tags, rules] = await Promise.all([
      this.listAccounts(),
      this.listTransactions(),
      this.listTags(),
      this.listTaggingRules(),
    ]);
    const files: ArchiveFile[] = [
      {
        name: "accounts.csv",
        content: Buffer.from(
          encodeCsv([
            ["id", "name", "type", "default_currency", "institution_name", "archived_at"],
            ...accounts.map((account) => [
              account.id,
              account.name,
              account.type,
              account.defaultCurrency,
              account.institutionName ?? "",
              account.archivedAt ?? "",
            ]),
          ]),
          "utf8",
        ),
      },
      { name: "transactions.csv", content: Buffer.from(transactionsToCsv(transactions, accounts, tags), "utf8") },
      {
        name: "tags.csv",
        content: Buffer.from(
          encodeCsv([
            ["id", "name", "normalized_name", "color"],
            ...tags.map((tag) => [tag.id, tag.name, tag.normalizedName, tag.color ?? ""]),
          ]),
          "utf8",
        ),
      },
      { name: "tagging_rules.json", content: Buffer.from(JSON.stringify(rules, null, 2), "utf8") },
    ];
    const result = await writeArchive(destination, archivePassword, files, this.headerValue.kdf);
    return { bytes: result.bytes, files: files.map((file) => file.name) };
  }

  async importArchive(
    source: string,
    archivePassword: string,
  ): Promise<{ accounts: number; transactions: number; tags: number; taggingRules: number }> {
    const { files } = await readArchive(source, archivePassword);
    const accounts = parseAccountsCsv(files.get("accounts.csv")?.toString("utf8") ?? "");
    const tags = parseTagsCsv(files.get("tags.csv")?.toString("utf8") ?? "");
    const transactions = transactionsFromCsv(files.get("transactions.csv")?.toString("utf8") ?? "");
    const rules = JSON.parse(
      files.get("tagging_rules.json")?.toString("utf8") ?? "[]",
    ) as TaggingRule[];

    await this.store().replaceAll({
      accounts,
      transactions,
      tags,
      tagging_rules: rules,
    });

    return {
      accounts: accounts.length,
      transactions: transactions.length,
      tags: tags.length,
      taggingRules: rules.length,
    };
  }

  async snapshot(label: string): Promise<string> {
    const destination = join(
      this.path,
      "snapshots",
      `${new Date().toISOString().replaceAll(":", "-")}-${label}.db`,
    );
    copyFileSync(join(this.path, DATABASE_FILE), destination);
    return destination;
  }

  async stats(): Promise<VaultStats> {
    const store = this.store();
    const [accounts, transactions, tags, taggingRules, applied] = await Promise.all([
      store.count("accounts"),
      store.count("transactions"),
      store.count("tags"),
      store.count("tagging_rules"),
      store.appliedMigrations(),
    ]);
    return {
      engine: store.engine,
      details: store.details,
      schemaVersion: Math.max(0, ...applied),
      counts: { accounts, transactions, tags, taggingRules },
      bytesOnDisk: store.bytesOnDisk(),
    };
  }

  private store(): VaultStore {
    if (!this.storeValue) {
      throw new VaultLockedError("vault is locked; unlock it before reading or writing data");
    }
    return this.storeValue;
  }
}

async function openStore(engine: StorageEngine, file: string, dek: Buffer): Promise<VaultStore> {
  return engine === "sqlcipher"
    ? SqlcipherVaultStore.open(file, dek)
    : RecordEncryptionVaultStore.open(file, dek);
}

function parseAccountsCsv(csv: string): Account[] {
  const rows = decodeCsv(csv);
  rows.shift();
  return rows
    .filter((row) => (row[0] ?? "") !== "")
    .map((row) => {
      const institutionName = row[4] ?? "";
      const archivedAt = row[5] ?? "";
      const now = new Date().toISOString();
      return {
        id: row[0] ?? "",
        name: row[1] ?? "",
        type: (row[2] ?? "other") as Account["type"],
        defaultCurrency: row[3] ?? "EUR",
        ...(institutionName ? { institutionName } : {}),
        ...(archivedAt ? { archivedAt } : {}),
        createdAt: now,
        updatedAt: now,
      } satisfies Account;
    });
}

function parseTagsCsv(csv: string): Tag[] {
  const rows = decodeCsv(csv);
  rows.shift();
  return rows
    .filter((row) => (row[0] ?? "") !== "")
    .map((row) => {
      const color = row[3] ?? "";
      const now = new Date().toISOString();
      return {
        id: row[0] ?? "",
        name: row[1] ?? "",
        normalizedName: row[2] ?? (row[1] ?? "").toLowerCase(),
        ...(color ? { color } : {}),
        createdAt: now,
        updatedAt: now,
      } satisfies Tag;
    });
}
