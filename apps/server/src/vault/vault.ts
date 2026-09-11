import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { VaultStatus } from "@flowly/web-contracts";
import { systemClock, type Clock } from "../domain/clock.js";
import {
  createVaultHeader,
  isVaultHeader,
  rewrapVaultHeader,
  unlockVaultHeader,
  zeroize,
  type VaultHeader,
} from "../crypto/envelope.js";
import { DEFAULT_KDF_PARAMS, type KdfParams } from "../crypto/kdf.js";
import { VaultCorruptError } from "../crypto/errors.js";
import { MIGRATIONS, type MigrationHooks } from "../storage/migrations.js";
import { StoreRepository } from "../storage/repositories.js";
import {
  openStore,
  type StorageEngine,
  type VaultStore,
  type VaultTable,
} from "../storage/store.js";
import { validateAccount, type Account } from "../domain/account.js";
import { validateTag, type Tag } from "../domain/tag.js";
import { validateTaggingRule, type TaggingRule } from "../domain/tagging-rule.js";
import { validateTransaction, type Transaction } from "../domain/transaction.js";
import { validateBudget, type Budget } from "../domain/budget.js";
import { validateRecurringRule, type RecurringRule } from "../domain/recurring.js";
import { EXPORT_FORMAT_VERSION, VAULT_FORMAT_VERSION } from "../version.js";

export class VaultLockedError extends Error {
  constructor(message = "vault is locked; unlock it before reading or writing data") {
    super(message);
    this.name = "VaultLockedError";
  }
}

export class VaultNotFoundError extends Error {
  constructor(message = "no vault exists at this location") {
    super(message);
    this.name = "VaultNotFoundError";
  }
}

export class VaultExistsError extends Error {
  constructor(message = "a vault already exists at this location") {
    super(message);
    this.name = "VaultExistsError";
  }
}

export interface VaultOptions {
  engine?: StorageEngine;
  kdf?: KdfParams;
  autoMigrate?: boolean;
  clock?: Clock;
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

export class Vault {
  static readonly headerFile = HEADER_FILE;
  static readonly databaseFile = DATABASE_FILE;

  readonly path: string;
  readonly engine: StorageEngine;
  readonly accounts: StoreRepository<Account>;
  readonly transactions: StoreRepository<Transaction>;
  readonly tags: StoreRepository<Tag>;
  readonly taggingRules: StoreRepository<TaggingRule>;
  readonly budgets: StoreRepository<Budget>;
  readonly recurringRules: StoreRepository<RecurringRule>;

  private readonly clock: Clock;
  private readonly headerValue: VaultHeader;
  private dek: Buffer | null;
  private storeValue: VaultStore | null;
  private lastUnlockedAt: string | null = null;

  private constructor(
    path: string,
    header: VaultHeader,
    dek: Buffer,
    store: VaultStore,
    engine: StorageEngine,
    clock: Clock,
  ) {
    this.path = path;
    this.headerValue = header;
    this.dek = dek;
    this.storeValue = store;
    this.engine = engine;
    this.clock = clock;

    const repository = <T extends { id: string; revision: number; updatedAt: string }>(
      table: VaultTable,
      validate: (value: T) => void,
      refs?: (value: T) => { refA?: string | null; refB?: string | null },
    ): StoreRepository<T> =>
      new StoreRepository<T>({
        getStore: () => this.store(),
        table,
        clock,
        validate,
        ...(refs ? { refs } : {}),
      });

    this.accounts = repository<Account>("accounts", validateAccount);
    this.tags = repository<Tag>("tags", validateTag, (tag) => ({ refA: tag.normalizedName }));
    this.taggingRules = repository<TaggingRule>("tagging_rules", validateTaggingRule);
    this.budgets = repository<Budget>("budgets", validateBudget);
    this.recurringRules = repository<RecurringRule>("recurring_rules", validateRecurringRule);
    this.transactions = repository<Transaction>(
      "transactions",
      validateTransaction,
      (transaction) => ({
        refA: transaction.accountId,
        refB: transaction.bookingDate,
      }),
    );
  }

  static async create(
    path: string,
    passphrase: string,
    options: VaultOptions = {},
  ): Promise<Vault> {
    if (Vault.exists(path)) {
      throw new VaultExistsError();
    }
    const clock = options.clock ?? systemClock;
    mkdirSync(path, { recursive: true, mode: 0o700 });
    mkdirSync(join(path, "snapshots"), { recursive: true, mode: 0o700 });
    const { header, dek } = await createVaultHeader(passphrase, options.kdf ?? DEFAULT_KDF_PARAMS);
    const headerPath = join(path, HEADER_FILE);
    writeFileSync(headerPath, `${JSON.stringify(header, null, 2)}\n`, { mode: 0o600 });
    chmodSync(headerPath, 0o600);
    const engine = options.engine ?? "sqlcipher";
    const store = await openStore(engine, join(path, DATABASE_FILE), dek);
    await store.migrate();
    const vault = new Vault(path, header, dek, store, engine, clock);
    vault.lastUnlockedAt = clock.nowIso();
    return vault;
  }

  static async open(path: string, passphrase: string, options: VaultOptions = {}): Promise<Vault> {
    const headerPath = join(path, HEADER_FILE);
    if (!existsSync(headerPath)) {
      throw new VaultNotFoundError(`no vault found at ${path}`);
    }
    const parsed = JSON.parse(readFileSync(headerPath, "utf8")) as unknown;
    if (!isVaultHeader(parsed)) {
      throw new VaultCorruptError("vault header is not a supported format");
    }
    const dek = await unlockVaultHeader(parsed, passphrase);
    const engine = options.engine ?? "sqlcipher";
    const clock = options.clock ?? systemClock;
    const store = await openStore(engine, join(path, DATABASE_FILE), dek);
    if (options.autoMigrate ?? true) {
      await store.migrate();
    }
    const vault = new Vault(path, parsed, dek, store, engine, clock);
    vault.lastUnlockedAt = clock.nowIso();
    return vault;
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
    const store = this.storeValue;
    this.storeValue = null;
    if (store) {
      await store.checkpoint().catch(() => undefined);
      await store.close();
    }
    zeroize(this.dek);
    this.dek = null;
  }

  async changePassphrase(currentPassphrase: string, nextPassphrase: string): Promise<void> {
    this.store();
    // Verifying the current passphrase re-derives the KEK and unwraps the DEK.
    const verified = await unlockVaultHeader(this.headerValue, currentPassphrase);
    zeroize(verified);
    const dek = this.dek;
    if (!dek) throw new VaultLockedError();
    const rewrapped = await rewrapVaultHeader(this.headerValue, dek, nextPassphrase);
    writeFileSync(join(this.path, HEADER_FILE), `${JSON.stringify(rewrapped, null, 2)}\n`, {
      mode: 0o600,
    });
    chmodSync(join(this.path, HEADER_FILE), 0o600);
  }

  async migrate(hooks: MigrationHooks = {}): Promise<number[]> {
    return this.store().migrate(hooks);
  }

  async appliedMigrations(): Promise<number[]> {
    return this.store().appliedMigrations();
  }

  async pendingMigrations(): Promise<number[]> {
    const applied = new Set(await this.store().appliedMigrations());
    return MIGRATIONS.filter((migration) => !applied.has(migration.version)).map(
      (migration) => migration.version,
    );
  }

  async status(): Promise<VaultStatus> {
    const unlocked = this.isUnlocked;
    let schemaVersion: number | null = null;
    if (unlocked) {
      const applied = await this.store().appliedMigrations();
      schemaVersion = applied.length > 0 ? Math.max(...applied) : 0;
    }
    return {
      state: unlocked ? "unlocked" : "locked",
      vaultFormatVersion: VAULT_FORMAT_VERSION,
      exportFormatVersion: EXPORT_FORMAT_VERSION,
      storageEngine: this.engine,
      schemaVersion,
      lastUnlockedAt: this.lastUnlockedAt,
    };
  }

  async snapshot(label: string): Promise<string> {
    const store = this.store();
    await store.checkpoint();
    const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 40);
    const destination = join(
      this.path,
      "snapshots",
      `${this.clock.nowIso().replaceAll(":", "-")}-${safeLabel}.db`,
    );
    copyFileSync(join(this.path, DATABASE_FILE), destination);
    chmodSync(destination, 0o600);
    return destination;
  }

  async stats(): Promise<VaultStats> {
    const store = this.store();
    const [accounts, transactions, tags, taggingRules, budgets, recurringRules, applied] =
      await Promise.all([
        store.count("accounts"),
        store.count("transactions"),
        store.count("tags"),
        store.count("tagging_rules"),
        store.count("budgets"),
        store.count("recurring_rules"),
        store.appliedMigrations(),
      ]);
    return {
      engine: store.engine,
      details: store.details,
      schemaVersion: applied.length > 0 ? Math.max(...applied) : 0,
      counts: { accounts, transactions, tags, taggingRules, budgets, recurringRules },
      bytesOnDisk: store.bytesOnDisk(),
    };
  }

  /** Stable, non-secret digest used to detect header tampering across restarts. */
  headerDigest(): string {
    return createHash("sha256")
      .update(JSON.stringify(this.headerValue.wrappedDek))
      .digest("hex")
      .slice(0, 16);
  }

  private store(): VaultStore {
    if (!this.storeValue) throw new VaultLockedError();
    return this.storeValue;
  }
}
