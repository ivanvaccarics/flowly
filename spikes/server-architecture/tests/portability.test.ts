import assert from "node:assert/strict";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  ArchiveIntegrityError,
  ArchivePasswordError,
  FlowlySpikeError,
} from "../src/errors.ts";
import { decodeCsv, transactionsFromCsv, transactionsToCsv } from "../src/portability/csv.ts";
import { formatMinorToAmount, parseAmountToMinor } from "../src/portability/money.ts";
import { Vault } from "../src/vault/vault.ts";
import {
  cleanup,
  sampleAccount,
  sampleTag,
  sampleTransaction,
  tempDir,
  TEST_KDF,
} from "./helpers/test-utils.ts";

const PASSPHRASE = "correct horse battery staple";
const ARCHIVE_PASSWORD = "archive password 1234";

test("amounts round-trip through minor units without floating point", () => {
  const cases: Array<[string, string, number]> = [
    ["-12.30", "EUR", -1230],
    ["0.01", "EUR", 1],
    ["1234567.89", "EUR", 123456789],
    ["-7", "JPY", -7],
    ["1.234", "KWD", 1234],
    ["-0.005", "BHD", -5],
  ];
  for (const [text, currency, minor] of cases) {
    assert.equal(parseAmountToMinor(text, currency), minor);
    assert.equal(formatMinorToAmount(minor, currency), text);
  }
  assert.throws(() => parseAmountToMinor("1.234", "EUR"), FlowlySpikeError);
  assert.throws(() => parseAmountToMinor("1,20", "EUR"), FlowlySpikeError);
  assert.throws(() => parseAmountToMinor("1.2.3", "EUR"), FlowlySpikeError);
  assert.throws(() => parseAmountToMinor("10", "XYZ"), FlowlySpikeError);
});

test("transaction CSV round-trips and blocks spreadsheet injection", () => {
  const transaction = sampleTransaction({
    payee: 'Bar "Centrale", Roma',
    userNote: "=cmd|' /C calc'!A0",
    description: "multi\nline description",
  });
  const csv = transactionsToCsv([transaction], [sampleAccount()], [sampleTag()]);
  assert.ok(csv.includes("'=cmd|' /C calc'!A0"), "formula-looking notes must be escaped");
  assert.ok(csv.includes("-12.30"), "plain negative amounts must stay unescaped");

  const parsed = transactionsFromCsv(csv);
  assert.equal(parsed.length, 1);
  assert.deepEqual(
    {
      id: parsed[0]?.id,
      accountId: parsed[0]?.accountId,
      bookingDate: parsed[0]?.bookingDate,
      amountMinor: parsed[0]?.amountMinor,
      currency: parsed[0]?.currency,
      payee: parsed[0]?.payee,
      userNote: parsed[0]?.userNote,
      description: parsed[0]?.description,
    },
    {
      id: transaction.id,
      accountId: transaction.accountId,
      bookingDate: transaction.bookingDate,
      amountMinor: -1230,
      currency: "EUR",
      payee: 'Bar "Centrale", Roma',
      userNote: "=cmd|' /C calc'!A0",
      description: "multi\nline description",
    },
  );

  const rows = decodeCsv(csv);
  assert.equal(rows[0]?.length, 12);
});

test("encrypted archive exports and imports a complete vault", async () => {
  const source = tempDir();
  const target = tempDir();
  const archivePath = join(source, "export.flowly");
  try {
    const vault = await Vault.create(source, PASSPHRASE, { kdf: TEST_KDF });
    await vault.putAccount(sampleAccount());
    await vault.putTag(sampleTag());
    await vault.putTransaction(sampleTransaction());
    await vault.putTransaction(
      sampleTransaction({
        id: "44444444-4444-4444-8444-444444444444",
        amountMinor: 250000,
        payee: "Employer Inc",
        userNote: "salary",
      }),
    );
    await vault.exportTransactionCsv(join(source, "transactions.csv"));
    assert.ok(statSync(join(source, "transactions.csv")).size > 0);

    const exported = await vault.exportArchive(archivePath, ARCHIVE_PASSWORD);
    assert.equal(exported.files.length, 4);
    await vault.lock();

    const destination = await Vault.create(target, PASSPHRASE, { kdf: TEST_KDF });
    const imported = await destination.importArchive(archivePath, ARCHIVE_PASSWORD);
    assert.deepEqual(imported, { accounts: 1, transactions: 2, tags: 1, taggingRules: 0 });
    const transactions = await destination.listTransactions();
    assert.equal(transactions.length, 2);
    assert.deepEqual(
      transactions.map((transaction) => transaction.id).sort(),
      [
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444",
      ],
    );
    assert.equal((await destination.stats()).counts.accounts, 1);
    await destination.lock();
  } finally {
    cleanup(source);
    cleanup(target);
  }
});

test("archive failures are explicit: wrong password, truncation, bad magic", async () => {
  const dir = tempDir();
  const archivePath = join(dir, "export.flowly");
  try {
    const vault = await Vault.create(dir, PASSPHRASE, { kdf: TEST_KDF });
    await vault.putTransaction(sampleTransaction());
    await vault.exportArchive(archivePath, ARCHIVE_PASSWORD);

    await assert.rejects(
      () => vault.importArchive(archivePath, "not the password"),
      ArchivePasswordError,
    );

    const container = readFileSync(archivePath);
    const truncated = join(dir, "truncated.flowly");
    writeFileSync(truncated, container.subarray(0, container.byteLength - 32));
    await assert.rejects(() => vault.importArchive(truncated, ARCHIVE_PASSWORD), ArchivePasswordError);

    const corrupt = Buffer.from(container);
    corrupt.write("NOTFLOWL", 0, "utf8");
    const corruptPath = join(dir, "corrupt.flowly");
    writeFileSync(corruptPath, corrupt);
    await assert.rejects(() => vault.importArchive(corruptPath, ARCHIVE_PASSWORD), ArchiveIntegrityError);

    const shortPath = join(dir, "short.flowly");
    writeFileSync(shortPath, container.subarray(0, 12));
    await assert.rejects(() => vault.importArchive(shortPath, ARCHIVE_PASSWORD), ArchiveIntegrityError);
    await vault.lock();
  } finally {
    cleanup(dir);
  }
});

test("encrypted snapshots can be taken before destructive work", async () => {
  const dir = tempDir();
  try {
    const vault = await Vault.create(dir, PASSPHRASE, { kdf: TEST_KDF });
    await vault.putTransaction(sampleTransaction());
    const snapshot = await vault.snapshot("before-import");
    assert.ok(statSync(snapshot).size > 0);
    assert.equal(snapshot.includes("snapshots"), true);
    const bytes = readFileSync(snapshot);
    assert.equal(bytes.includes(Buffer.from("espresso with Luca", "utf8")), false);
    await vault.lock();
  } finally {
    cleanup(dir);
  }
});
