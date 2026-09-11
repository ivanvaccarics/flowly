import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ImportExportService } from "../src/application/import-export-service.js";
import { readArchive, writeArchive } from "../src/portability/archive.js";
import { TaggingRuleService } from "../src/application/tagging-rule-service.js";
import { createAccount } from "../src/domain/account.js";
import { generateId } from "../src/domain/ids.js";
import { createTag } from "../src/domain/tag.js";
import { createTransaction, type Transaction } from "../src/domain/transaction.js";
import {
  ArchiveIntegrityError,
  ArchivePasswordError,
  ImportError,
} from "../src/portability/errors.js";
import { Vault } from "../src/vault/vault.js";
import { cleanup, tempDir, TEST_KDF } from "./helpers/test-utils.js";

const NOW = "2026-09-01T08:00:00.000Z";
const ACCOUNT_ID = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
const COFFEE_TAG = "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081";
const ARCHIVE_PASSWORD = "archive password 1234";

async function setupVault(prefix: string) {
  const dir = tempDir(prefix);
  const vault = await Vault.create(dir, "correct horse battery staple", { kdf: TEST_KDF });
  const taggingRules = new TaggingRuleService(vault);
  const service = new ImportExportService({ vault, taggingRules, newId: generateId });
  return { dir, vault, service };
}

async function seed(service: ImportExportService, vault: Vault): Promise<void> {
  await vault.accounts.create(
    createAccount(
      { name: "Everyday", type: "checking", defaultCurrency: "EUR" },
      { id: ACCOUNT_ID, now: NOW },
    ),
  );
  await vault.tags.create(createTag({ name: "Coffee" }, { id: COFFEE_TAG, now: NOW }));
  await vault.taggingRules.create({
    formatVersion: 1,
    revision: 1,
    id: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7081",
    name: "Coffee",
    enabled: true,
    combinator: "and",
    conditions: [{ field: "userNote", operator: "contains", value: "espresso" }],
    tagIds: [COFFEE_TAG],
    createdAt: NOW,
    updatedAt: NOW,
  });
  await vault.transactions.create(
    createTransaction(
      {
        accountId: ACCOUNT_ID,
        bookingDate: "2026-09-03",
        amountMinor: -1230,
        currency: "EUR",
        payee: "Bar Centrale",
        description: "CARD PURCHASE",
        userNote: "espresso with Luca",
        tagIds: [COFFEE_TAG],
      },
      { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70", now: NOW },
    ),
  );
  void service;
}

describe("transaction CSV", () => {
  it("round-trips ids, amounts, dates, notes, tags and formula protection", async () => {
    const { dir, vault, service } = await setupVault("flowly-csv-");
    try {
      await seed(service, vault);
      await vault.transactions.create(
        createTransaction(
          {
            accountId: ACCOUNT_ID,
            bookingDate: "2026-09-04",
            amountMinor: -2500,
            currency: "EUR",
            userNote: '=HYPERLINK("http://evil")',
          },
          { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f71", now: NOW },
        ),
      );

      const csv = await service.exportTransactionsCsv();
      expect(csv).toContain("'=HYPERLINK");
      expect(csv).toContain("-12.30");
      expect(csv.split("\r\n")[0]).toContain("user_note");

      const target = await setupVault("flowly-csv-target-");
      try {
        await target.vault.accounts.create(
          createAccount(
            { name: "Everyday", type: "checking", defaultCurrency: "EUR" },
            { id: ACCOUNT_ID, now: NOW },
          ),
        );
        const preview = await target.service.previewTransactionCsv(csv);
        expect(preview.valid).toBe(2);
        expect(preview.duplicates).toBe(0);
        expect(preview.newTags).toEqual(["Coffee"]);

        const report = await target.service.importTransactionCsv(csv);
        expect(report.created).toBe(2);
        expect(report.tagsCreated).toBe(1);
        const imported = await target.vault.transactions.list();
        expect(imported).toHaveLength(2);
        const first = imported.find(
          (transaction) => transaction.id === "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70",
        );
        expect(first?.amountMinor).toBe(-1230);
        expect(first?.bookingDate).toBe("2026-09-03");
        expect(first?.userNote).toBe("espresso with Luca");
        expect(first?.tagIds).toHaveLength(1);
        expect(first?.importFingerprint).toMatch(/^[0-9a-f]{32}$/);

        const again = await target.service.importTransactionCsv(csv);
        expect(again.created).toBe(0);
        expect(again.skippedDuplicates).toBe(2);
      } finally {
        await target.vault.lock();
        cleanup(target.dir);
      }
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("reports malformed rows, unknown accounts and large files", async () => {
    const { dir, vault, service } = await setupVault("flowly-csv-bad-");
    try {
      await vault.accounts.create(
        createAccount(
          { name: "Everyday", type: "checking", defaultCurrency: "EUR" },
          { id: ACCOUNT_ID, now: NOW },
        ),
      );

      const malformed = [
        "id,account_id,booking_date,amount,currency",
        `${generateId()},${ACCOUNT_ID},2026-09-03,not-a-number,EUR`,
        `${generateId()},${ACCOUNT_ID},2026-02-30,10.00,EUR`,
      ].join("\r\n");
      const preview = await service.previewTransactionCsv(malformed);
      expect(preview.errors.length).toBeGreaterThan(0);
      expect(preview.valid).toBe(0);

      const unknownAccount = [
        "id,account_id,booking_date,amount,currency",
        `${generateId()},018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e70,2026-09-03,10.00,EUR`,
      ].join("\r\n");
      const report = await service.importTransactionCsv(unknownAccount);
      expect(report.created).toBe(0);
      expect(report.errors[0]?.message).toContain("unknown account");

      const rows = ["id,account_id,booking_date,amount,currency,payee"];
      for (let index = 0; index < 2000; index += 1) {
        rows.push(
          `${generateId()},${ACCOUNT_ID},2026-09-${String((index % 28) + 1).padStart(2, "0")},-1.00,EUR,Merchant ${index}`,
        );
      }
      const large = await service.importTransactionCsv(rows.join("\r\n"));
      expect(large.created).toBe(2000);
      expect(await vault.transactions.count()).toBe(2000);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("rejects a CSV without the required columns", async () => {
    const { dir, vault, service } = await setupVault("flowly-csv-header-");
    try {
      const preview = await service.previewTransactionCsv("foo,bar\r\n1,2\r\n");
      expect(preview.valid).toBe(0);
      expect(preview.errors[0]?.message).toContain("missing columns");
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });
});

describe("complete portable archive", () => {
  it("still imports an archive exported before budgets were removed", async () => {
    const source = await setupVault("flowly-archive-legacy-");
    const target = await setupVault("flowly-archive-legacy-target-");
    const archivePath = join(source.dir, "legacy.flowly");
    try {
      await seed(source.service, source.vault);
      await source.service.exportArchive(archivePath, ARCHIVE_PASSWORD);

      // Rebuild the archive with the extra entry old exports carried.
      const { files, manifest } = await readArchive(archivePath, ARCHIVE_PASSWORD);
      await writeArchive(
        archivePath,
        ARCHIVE_PASSWORD,
        manifest.vaultId,
        [
          ...[...files.entries()].map(([name, content]) => ({ name, content })),
          { name: "budgets.csv", content: Buffer.from("[]", "utf8") },
        ],
        TEST_KDF,
      );

      const report = await target.service.importArchive(archivePath, ARCHIVE_PASSWORD);
      expect(report.accounts).toBe(1);
      expect(report.transactions).toBe(1);
      expect(report.taggingRules).toBe(1);
    } finally {
      await source.vault.lock();
      await target.vault.lock();
      cleanup(source.dir);
      cleanup(target.dir);
    }
  });

  it("round-trips a whole vault and replaces the destination atomically", async () => {
    const source = await setupVault("flowly-archive-");
    const target = await setupVault("flowly-archive-target-");
    const archivePath = join(source.dir, "vault.flowly");
    try {
      await seed(source.service, source.vault);
      const exported = await source.service.exportArchive(archivePath, ARCHIVE_PASSWORD);
      expect(exported.manifest.entries.map((entry) => entry.name)).toContain("tagging_rules.json");
      expect(exported.manifest.entries.map((entry) => entry.name)).not.toContain(
        "recurring_rules.csv",
      );
      expect(exported.manifest.vaultId).toBe(source.vault.header.vaultId);

      const report = await target.service.importArchive(archivePath, ARCHIVE_PASSWORD);
      expect(report.accounts).toBe(1);
      expect(report.transactions).toBe(1);
      expect(report.tags).toBe(1);
      expect(report.taggingRules).toBe(1);
      expect(report.snapshot).toContain("snapshots");

      const transactions = await target.vault.transactions.list();
      expect(transactions[0]?.id).toBe("018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70");
      expect(transactions[0]?.userNote).toBe("espresso with Luca");
      expect(transactions[0]?.tagIds).toEqual([COFFEE_TAG]);
      expect((await target.vault.taggingRules.list())[0]?.name).toBe("Coffee");
    } finally {
      await source.vault.lock();
      await target.vault.lock();
      cleanup(source.dir);
      cleanup(target.dir);
    }
  });

  it("imports an archive that still carries recurring_rules.csv", async () => {
    const source = await setupVault("flowly-archive-legacy-recurring-");
    const target = await setupVault("flowly-archive-legacy-recurring-target-");
    const archivePath = join(source.dir, "legacy.flowly");
    try {
      await seed(source.service, source.vault);
      await source.service.exportArchive(archivePath, ARCHIVE_PASSWORD);

      // Old exports always carried the file, even when it held no rules.
      const { files, manifest } = await readArchive(archivePath, ARCHIVE_PASSWORD);
      await writeArchive(
        archivePath,
        ARCHIVE_PASSWORD,
        manifest.vaultId,
        [
          ...[...files.entries()].map(([name, content]) => ({ name, content })),
          { name: "recurring_rules.csv", content: Buffer.from("[]", "utf8") },
        ],
        TEST_KDF,
      );

      const report = await target.service.importArchive(archivePath, ARCHIVE_PASSWORD);
      expect(report.accounts).toBe(1);
      expect(report.transactions).toBe(1);
      expect(report.taggingRules).toBe(1);
    } finally {
      await source.vault.lock();
      await target.vault.lock();
      cleanup(source.dir);
      cleanup(target.dir);
    }
  });

  it("fails closed on a wrong password, tampering, or a same-vault archive", async () => {
    const source = await setupVault("flowly-archive-fail-");
    const archivePath = join(source.dir, "vault.flowly");
    try {
      await seed(source.service, source.vault);
      await source.service.exportArchive(archivePath, ARCHIVE_PASSWORD);

      await expect(source.service.importArchive(archivePath, "wrong password")).rejects.toThrow(
        ArchivePasswordError,
      );

      const container = readFileSync(archivePath);
      const truncated = join(source.dir, "truncated.flowly");
      writeFileSync(truncated, container.subarray(0, container.byteLength - 40));
      await expect(source.service.importArchive(truncated, ARCHIVE_PASSWORD)).rejects.toThrow(
        ArchivePasswordError,
      );

      const corrupt = Buffer.from(container);
      corrupt.write("NOTFLOWL", 0, "utf8");
      const corruptPath = join(source.dir, "corrupt.flowly");
      writeFileSync(corruptPath, corrupt);
      await expect(source.service.importArchive(corruptPath, ARCHIVE_PASSWORD)).rejects.toThrow(
        ArchiveIntegrityError,
      );

      await expect(source.service.importArchive(archivePath, ARCHIVE_PASSWORD)).rejects.toThrow(
        ImportError,
      );
    } finally {
      await source.vault.lock();
      cleanup(source.dir);
    }
  });

  it("leaves the destination untouched when the archive is inconsistent", async () => {
    const source = await setupVault("flowly-archive-broken-");
    const target = await setupVault("flowly-archive-safe-");
    try {
      await target.vault.accounts.create(
        createAccount(
          { name: "Keep me", type: "checking", defaultCurrency: "EUR" },
          { id: ACCOUNT_ID, now: NOW },
        ),
      );
      await source.vault.accounts.create(
        createAccount(
          { name: "Source", type: "checking", defaultCurrency: "EUR" },
          { id: ACCOUNT_ID, now: NOW },
        ),
      );
      const orphan: Transaction = {
        ...createTransaction(
          {
            accountId: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e70",
            bookingDate: "2026-09-03",
            amountMinor: -1,
            currency: "EUR",
          },
          { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f79", now: NOW },
        ),
        accountId: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e70",
      };
      await source.vault.transactions.create(orphan);
      const archivePath = join(source.dir, "broken.flowly");
      await source.service.exportArchive(archivePath, ARCHIVE_PASSWORD);

      await expect(target.service.importArchive(archivePath, ARCHIVE_PASSWORD)).rejects.toThrow(
        ImportError,
      );
      expect((await target.vault.accounts.list())[0]?.name).toBe("Keep me");
    } finally {
      await source.vault.lock();
      await target.vault.lock();
      cleanup(source.dir);
      cleanup(target.dir);
    }
  });
});
