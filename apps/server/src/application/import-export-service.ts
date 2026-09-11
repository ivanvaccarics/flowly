import { createHash } from "node:crypto";
import type { Clock } from "../domain/clock.js";
import { systemClock } from "../domain/clock.js";
import { normalizeTagName } from "../domain/values.js";
import { createTag, type Tag } from "../domain/tag.js";
import {
  importFingerprint,
  type Transaction,
  type TransactionSource,
  type TransactionStatus,
} from "../domain/transaction.js";
import {
  accountsToCsv,
  parseAccountsCsv,
  parseTagsCsv,
  parseTransactionCsv,
  recurringRulesToCsv,
  taggingRulesToCsv,
  tagsToCsv,
  transactionsToCsv,
  type CsvParseError,
} from "../portability/csv.js";
import { readArchive, writeArchive, type ArchiveManifest } from "../portability/archive.js";
import { createZip } from "../portability/zip.js";
import { ImportError } from "../portability/errors.js";
import type { Vault } from "../vault/vault.js";
import type { TaggingRuleService } from "./tagging-rule-service.js";

export interface CsvPreview {
  rows: number;
  valid: number;
  duplicates: number;
  errors: CsvParseError[];
  newTags: string[];
  unknownAccounts: string[];
  sample: Array<{
    bookingDate: string;
    payee?: string;
    amountMinor: number;
    currency: string;
    tagNames: string[];
  }>;
}

export interface CsvImportReport {
  created: number;
  skippedDuplicates: number;
  invalid: number;
  tagsCreated: number;
  transactionsTaggedByRules: number;
  errors: CsvParseError[];
}

export interface ArchiveImportReport {
  accounts: number;
  transactions: number;
  tags: number;
  taggingRules: number;
  recurringRules: number;
  snapshot: string;
  manifest: ArchiveManifest;
}

export interface TablesExport {
  content: Buffer;
  filename: string;
  counts: Record<string, number>;
}

export interface ImportExportServiceOptions {
  vault: Vault;
  taggingRules: TaggingRuleService;
  clock?: Clock;
  newId: () => string;
}

/** Transaction CSV and complete portable archive import/export. */
export class ImportExportService {
  private readonly vault: Vault;
  private readonly taggingRules: TaggingRuleService;
  private readonly clock: Clock;
  private readonly newId: () => string;

  constructor(options: ImportExportServiceOptions) {
    this.vault = options.vault;
    this.taggingRules = options.taggingRules;
    this.clock = options.clock ?? systemClock;
    this.newId = options.newId;
  }

  async exportTransactionsCsv(): Promise<string> {
    const [transactions, tags] = await Promise.all([
      this.vault.transactions.list(),
      this.vault.tags.list(),
    ]);
    return transactionsToCsv(transactions, tags);
  }

  /**
   * Every table as a plain CSV inside one ZIP: the "take my data and leave"
   * export. Nothing is encrypted and nothing is written to the server's disk —
   * the archive is built in memory and handed to the browser.
   */
  async exportTablesZip(): Promise<TablesExport> {
    const [accounts, transactions, tags, taggingRules, recurringRules] = await Promise.all([
      this.vault.accounts.list(),
      this.vault.transactions.list(),
      this.vault.tags.list(),
      this.vault.taggingRules.list(),
      this.vault.recurringRules.list(),
    ]);

    const exportedAt = this.clock.nowIso();
    const folder = `flowly-export-${exportedAt.slice(0, 10)}`;
    const files = [
      { name: "accounts.csv", rows: accounts.length, content: accountsToCsv(accounts) },
      {
        name: "transactions.csv",
        rows: transactions.length,
        content: transactionsToCsv(transactions, tags),
      },
      { name: "tags.csv", rows: tags.length, content: tagsToCsv(tags) },
      {
        name: "tagging_rules.csv",
        rows: taggingRules.length,
        content: taggingRulesToCsv(taggingRules, tags),
      },
      {
        name: "recurring_rules.csv",
        rows: recurringRules.length,
        content: recurringRulesToCsv(recurringRules, accounts, tags),
      },
    ].map((file) => ({ ...file, content: Buffer.from(file.content, "utf8") }));

    const counts = {
      accounts: accounts.length,
      transactions: transactions.length,
      tags: tags.length,
      taggingRules: taggingRules.length,
      recurringRules: recurringRules.length,
    };
    const manifest = {
      format: "flowly-tables-v1",
      exportedAt,
      vaultId: this.vault.header.vaultId,
      encrypted: false,
      counts,
      files: files.map((file) => ({
        name: file.name,
        rows: file.rows,
        bytes: file.content.length,
        sha256: sha256Hex(file.content),
      })),
    };

    const content = createZip(
      [
        {
          name: `${folder}/README.txt`,
          content: Buffer.from(tablesReadme(exportedAt, counts), "utf8"),
        },
        {
          name: `${folder}/manifest.json`,
          content: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
        },
        ...files.map((file) => ({ name: `${folder}/${file.name}`, content: file.content })),
      ],
      { modifiedAt: new Date(exportedAt) },
    );

    return { content, filename: `${folder}.zip`, counts };
  }

  async exportArchive(
    destination: string,
    password: string,
  ): Promise<{ bytes: number; manifest: ArchiveManifest }> {
    const [accounts, transactions, tags, rules, recurringRules] = await Promise.all([
      this.vault.accounts.list(),
      this.vault.transactions.list(),
      this.vault.tags.list(),
      this.vault.taggingRules.list(),
      this.vault.recurringRules.list(),
    ]);
    return writeArchive(
      destination,
      password,
      this.vault.header.vaultId,
      [
        { name: "accounts.csv", content: Buffer.from(accountsToCsv(accounts), "utf8") },
        {
          name: "transactions.csv",
          content: Buffer.from(transactionsToCsv(transactions, tags), "utf8"),
        },
        { name: "tags.csv", content: Buffer.from(tagsToCsv(tags), "utf8") },
        {
          name: "tagging_rules.json",
          content: Buffer.from(JSON.stringify(rules, null, 2), "utf8"),
        },
        {
          name: "recurring_rules.csv",
          content: Buffer.from(JSON.stringify(recurringRules, null, 2), "utf8"),
        },
      ],
      {
        algorithm: "argon2id",
        memoryCostKiB: this.vault.header.kdf.memoryCostKiB,
        timeCost: this.vault.header.kdf.timeCost,
        parallelism: this.vault.header.kdf.parallelism,
        outputLen: this.vault.header.kdf.outputLen,
      },
    );
  }

  /** Validates a transaction CSV without writing anything. */
  async previewTransactionCsv(text: string): Promise<CsvPreview> {
    const parsed = parseTransactionCsv(text, this.newId);
    const [tags, accounts, transactions] = await Promise.all([
      this.vault.tags.list(),
      this.vault.accounts.list(),
      this.vault.transactions.list(),
    ]);
    const knownTagNames = new Set(tags.map((tag) => tag.normalizedName));
    const knownAccounts = new Set(accounts.map((account) => account.id));
    const existingIds = new Set(transactions.map((transaction) => transaction.id));
    const existingFingerprints = new Set(
      transactions.map((transaction) => transaction.importFingerprint).filter(Boolean),
    );

    const newTagNames = new Set<string>();
    const unknownAccounts = new Set<string>();
    let duplicates = 0;
    for (const row of parsed.rows) {
      if (!knownAccounts.has(row.value.accountId)) unknownAccounts.add(row.value.accountId);
      for (const name of row.value.tagNames) {
        const normalized = normalizeTagName(name);
        if (!knownTagNames.has(normalized)) newTagNames.add(name);
      }
      if (
        existingIds.has(row.value.id) ||
        existingFingerprints.has(
          importFingerprint({
            accountId: row.value.accountId,
            bookingDate: row.value.bookingDate,
            amountMinor: row.value.amountMinor,
            currency: row.value.currency,
            ...(row.value.description ? { description: row.value.description } : {}),
            ...(row.value.payee ? { payee: row.value.payee } : {}),
          }),
        )
      ) {
        duplicates += 1;
      }
    }

    return {
      rows: parsed.rows.length + parsed.errors.length,
      valid: parsed.rows.length,
      duplicates,
      errors: parsed.errors,
      newTags: [...newTagNames],
      unknownAccounts: [...unknownAccounts],
      sample: parsed.rows.slice(0, 5).map((row) => ({
        bookingDate: row.value.bookingDate,
        ...(row.value.payee ? { payee: row.value.payee } : {}),
        amountMinor: row.value.amountMinor,
        currency: row.value.currency,
        tagNames: row.value.tagNames,
      })),
    };
  }

  /** Merges a transaction CSV: additive, deduplicated and rule-tagged. */
  async importTransactionCsv(text: string): Promise<CsvImportReport> {
    const parsed = parseTransactionCsv(text, this.newId);
    const [tags, accounts, existing] = await Promise.all([
      this.vault.tags.list(),
      this.vault.accounts.list(),
      this.vault.transactions.list(),
    ]);
    const tagsByName = new Map(tags.map((tag) => [tag.normalizedName, tag]));
    const knownAccounts = new Set(accounts.map((account) => account.id));
    const knownIds = new Set(existing.map((transaction) => transaction.id));
    const knownFingerprints = new Set(
      existing.map((transaction) => transaction.importFingerprint).filter(Boolean),
    );
    const rules = await this.taggingRules.rules();

    const report: CsvImportReport = {
      created: 0,
      skippedDuplicates: 0,
      invalid: parsed.errors.length,
      tagsCreated: 0,
      transactionsTaggedByRules: 0,
      errors: [...parsed.errors],
    };
    let createdTags = 0;

    await this.vault.transaction(async () => {
      for (const row of parsed.rows) {
        if (!knownAccounts.has(row.value.accountId)) {
          report.errors.push({
            line: row.line,
            message: `unknown account ${row.value.accountId}`,
          });
          report.invalid += 1;
          continue;
        }
        const fingerprint = importFingerprint({
          accountId: row.value.accountId,
          bookingDate: row.value.bookingDate,
          amountMinor: row.value.amountMinor,
          currency: row.value.currency,
          ...(row.value.description ? { description: row.value.description } : {}),
          ...(row.value.payee ? { payee: row.value.payee } : {}),
        });
        if (knownIds.has(row.value.id) || knownFingerprints.has(fingerprint)) {
          report.skippedDuplicates += 1;
          continue;
        }

        const tagIds: string[] = [];
        for (const name of row.value.tagNames) {
          const normalized = normalizeTagName(name);
          const existingTag = tagsByName.get(normalized);
          if (existingTag) {
            tagIds.push(existingTag.id);
            continue;
          }
          const tag = await this.vault.tags.create(
            createTag({ name }, { id: this.newId(), now: this.clock.nowIso() }),
          );
          tagsByName.set(tag.normalizedName, tag);
          tagIds.push(tag.id);
          createdTags += 1;
        }

        const now = this.clock.nowIso();
        const transaction: Transaction = {
          formatVersion: 1,
          revision: 1,
          id: row.value.id,
          accountId: row.value.accountId,
          bookingDate: row.value.bookingDate,
          amountMinor: row.value.amountMinor,
          currency: row.value.currency,
          status: row.value.status as TransactionStatus,
          source: (row.value.source ?? "csv-import") as TransactionSource,
          tagIds,
          importFingerprint: fingerprint,
          createdAt: now,
          updatedAt: now,
          ...(row.value.valueDate ? { valueDate: row.value.valueDate } : {}),
          ...(row.value.payee ? { payee: row.value.payee } : {}),
          ...(row.value.description ? { description: row.value.description } : {}),
          ...(row.value.userNote ? { userNote: row.value.userNote } : {}),
        };
        const { transaction: tagged, addedTagIds } = this.taggingRules.withRuleTags(
          transaction,
          rules,
        );
        await this.vault.transactions.create(tagged);
        if (addedTagIds.length > 0) report.transactionsTaggedByRules += 1;
        knownIds.add(tagged.id);
        knownFingerprints.add(fingerprint);
        report.created += 1;
      }
    });

    report.tagsCreated = createdTags;
    return report;
  }

  /**
   * Replaces the vault with a complete archive. A safety snapshot is written
   * first and the replacement runs inside one transaction.
   */
  async importArchive(source: string, password: string): Promise<ArchiveImportReport> {
    const { manifest, files } = await readArchive(source, password);
    const accounts = parseAccountsCsv(files.get("accounts.csv")?.toString("utf8") ?? "");
    const tags = parseTagsCsv(files.get("tags.csv")?.toString("utf8") ?? "");
    const tagNames = new Map(tags.map((tag) => [tag.id, tag.normalizedName]));
    const transactions = this.parseArchiveTransactions(
      files.get("transactions.csv")?.toString("utf8") ?? "",
      tagNames,
    );
    const taggingRules = parseJsonArray(files.get("tagging_rules.json"), "tagging_rules.json");
    const recurringRules = parseJsonArray(files.get("recurring_rules.csv"), "recurring_rules.csv");

    if (manifest.vaultId === this.vault.header.vaultId) {
      throw new ImportError("this archive was exported from the same vault");
    }

    const accountIds = new Set(accounts.map((account) => account.id));
    const orphans = transactions.filter((transaction) => !accountIds.has(transaction.accountId));
    if (orphans.length > 0) {
      throw new ImportError(
        `archive transactions reference unknown accounts: ${orphans
          .slice(0, 3)
          .map((transaction) => transaction.accountId)
          .join(", ")}`,
      );
    }
    const tagIds = new Set(tags.map((tag) => tag.id));
    const unknownTags = transactions.flatMap((transaction) =>
      transaction.tagIds.filter((tagId) => !tagIds.has(tagId)),
    );
    if (unknownTags.length > 0) {
      throw new ImportError(`archive transactions reference unknown tags: ${unknownTags[0]}`);
    }

    const snapshot = await this.vault.snapshot("before-archive-import");
    try {
      await this.vault.replaceAllContent({
        accounts,
        transactions,
        tags,
        taggingRules: taggingRules as never,
        recurringRules: recurringRules as never,
      });
    } catch (error) {
      throw new ImportError(
        `archive import failed and the vault was left unchanged (snapshot: ${snapshot})`,
        { cause: error },
      );
    }

    return {
      accounts: accounts.length,
      transactions: transactions.length,
      tags: tags.length,
      taggingRules: taggingRules.length,
      recurringRules: recurringRules.length,
      snapshot,
      manifest,
    };
  }

  private parseArchiveTransactions(text: string, tagNames: Map<string, string>): Transaction[] {
    const parsed = parseTransactionCsv(text, this.newId);
    if (parsed.errors.length > 0) {
      throw new ImportError(
        `archive transactions are invalid: ${parsed.errors
          .slice(0, 3)
          .map((error) => `line ${error.line}: ${error.message}`)
          .join("; ")}`,
      );
    }
    return parsed.rows.map((row) => {
      const now = this.clock.nowIso();
      const tagIds = row.value.tagNames
        .map((name) => {
          const normalized = normalizeTagName(name);
          for (const [id, candidate] of tagNames) {
            if (candidate === normalized) return id;
          }
          return undefined;
        })
        .filter((id): id is string => id !== undefined);
      return {
        formatVersion: 1,
        revision: 1,
        id: row.value.id,
        accountId: row.value.accountId,
        bookingDate: row.value.bookingDate,
        amountMinor: row.value.amountMinor,
        currency: row.value.currency,
        status: row.value.status,
        source: row.value.source,
        tagIds,
        createdAt: now,
        updatedAt: now,
        ...(row.value.valueDate ? { valueDate: row.value.valueDate } : {}),
        ...(row.value.payee ? { payee: row.value.payee } : {}),
        ...(row.value.description ? { description: row.value.description } : {}),
        ...(row.value.userNote ? { userNote: row.value.userNote } : {}),
      } satisfies Transaction;
    });
  }
}

function parseJsonArray(content: Buffer | undefined, name: string): unknown[] {
  if (!content) throw new ImportError(`archive is missing ${name}`);
  try {
    const parsed = JSON.parse(content.toString("utf8")) as unknown;
    if (!Array.isArray(parsed)) throw new ImportError(`${name} is not a JSON array`);
    return parsed;
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError(`${name} is not valid JSON`, { cause: error });
  }
}

/** Exported for tests that need the same hashing used by the manifest. */
export function sha256Hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** The note that travels inside the plain-text ZIP export. */
function tablesReadme(exportedAt: string, counts: Record<string, number>): string {
  return `Flowly - plain-text data export
Exported: ${exportedAt}
Rows: ${counts.accounts} accounts, ${counts.transactions} transactions, ${counts.tags} tags,
      ${counts.taggingRules} tagging rules, ${counts.recurringRules} recurring rules

WHAT THIS IS
  Every table in your Flowly vault as a CSV file, so you can read, archive or
  reuse your data without Flowly.

FILES
  accounts.csv         one row per account
  transactions.csv     one row per transaction, same format as the single-file CSV export
  tags.csv             one row per tag
  tagging_rules.csv    one row per tagging rule; "conditions" is a JSON array
  recurring_rules.csv  one row per recurring rule
  manifest.json        row counts and a SHA-256 checksum per file

THIS EXPORT IS PLAIN TEXT
  It is not encrypted and it is not a backup: anyone who opens these files reads
  your finances. Keep the ZIP somewhere you trust, and use the encrypted .flowly
  archive for backups and for moving a vault to another Flowly.

RESTORING
  Flowly restores from the encrypted .flowly archive, not from this ZIP.
  transactions.csv uses the documented export format, so a ledger can still be
  merged back through "Import transactions CSV" in Settings.

FORMATS
  Amounts are decimal strings in the row's ISO 4217 currency, dates are ISO 8601,
  and spreadsheet-facing fields are protected against formula injection.
  contracts/csv/export-format-v1.md documents accounts.csv, transactions.csv and
  tags.csv.
`;
}

export type { Tag };
