import type { Account } from "../domain/account.js";
import type { Budget } from "../domain/budget.js";
import type { Clock } from "../domain/clock.js";
import type { RecurringRule } from "../domain/recurring.js";
import type { Tag } from "../domain/tag.js";
import type { TaggingRule } from "../domain/tagging-rule.js";
import type { Transaction } from "../domain/transaction.js";

/** Repository and platform-service boundaries the server depends on. */
export interface Repository<T> {
  get(id: string): Promise<T | undefined>;
  list(): Promise<T[]>;
  save(entity: T): Promise<void>;
  delete(id: string): Promise<void>;
}

export type AccountRepository = Repository<Account>;

export interface TransactionRepository extends Repository<Transaction> {
  listByAccount(accountId: string): Promise<Transaction[]>;
  findByFingerprint(fingerprint: string): Promise<Transaction | undefined>;
}

export interface TagRepository extends Repository<Tag> {
  findByNormalizedName(normalizedName: string): Promise<Tag | undefined>;
}

export interface TaggingRuleRepository extends Repository<TaggingRule> {
  listOrdered(): Promise<TaggingRule[]>;
}

export type BudgetRepository = Repository<Budget>;

export type RecurringRuleRepository = Repository<RecurringRule>;

export interface UnitOfWork {
  /** Runs a multi-record write atomically across repositories. */
  transaction<T>(work: () => Promise<T>): Promise<T>;
}

export interface TaggingRuleService {
  /** Rule evaluation for a single transaction, inside the caller's atomic write. */
  tagsFor(transaction: Transaction): Promise<string[]>;
  /** Explicit backfill over existing transactions; idempotent. */
  backfill(scope?: { accountId?: string; fromDate?: string; toDate?: string }): Promise<{
    evaluated: number;
    changed: number;
  }>;
}

export interface ImportExportService {
  exportTransactionCsv(destination: string): Promise<{ rows: number; bytes: number }>;
  exportArchive(destination: string, password: string): Promise<{ bytes: number; files: string[] }>;
  importArchive(source: string, password: string): Promise<Record<string, number>>;
}

export interface IdGenerator {
  next(): string;
}

export interface SecureKeyStore {
  store(key: string, value: Buffer): Promise<void>;
  load(key: string): Promise<Buffer | undefined>;
  remove(key: string): Promise<void>;
}

/** Native-only adapters; the self-hosted web client never uses these. */
export interface FilePicker {
  pickFile(options: { extensions: string[] }): Promise<{ path: string } | undefined>;
  pickSaveLocation(options: { suggestedName: string }): Promise<{ path: string } | undefined>;
}

export interface BiometricUnlock {
  isAvailable(): Promise<boolean>;
  requestUnlock(reason: string): Promise<boolean>;
}

export interface ServerServices {
  clock: Clock;
  ids: IdGenerator;
  accounts: AccountRepository;
  transactions: TransactionRepository;
  tags: TagRepository;
  taggingRules: TaggingRuleRepository;
  budgets: BudgetRepository;
  recurringRules: RecurringRuleRepository;
  unitOfWork: UnitOfWork;
}
