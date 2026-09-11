import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { createVaultHeader, unlockVaultHeader } from "../crypto/envelope.ts";
import { DEFAULT_KDF_PARAMS, INTERACTIVE_KDF_PARAMS, type KdfParams } from "../crypto/kdf.ts";
import type { Transaction } from "../domain/types.ts";
import { Vault, type StorageEngine } from "../vault/vault.ts";

const RECORDS = 2000;
const PASSPHRASE = "benchmark passphrase";
const ARCHIVE_PASSWORD = "benchmark archive password";

const HARDENED_KDF: KdfParams = {
  algorithm: "argon2id",
  memoryCostKiB: 65536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
};

function mean(samples: number[]): number {
  return samples.reduce((total, value) => total + value, 0) / samples.length;
}

function makeTransactions(count: number, accountId: string): Transaction[] {
  const transactions: Transaction[] = [];
  const now = new Date().toISOString();
  for (let index = 0; index < count; index += 1) {
    transactions.push({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      accountId,
      bookingDate: `2026-09-${String((index % 28) + 1).padStart(2, "0")}`,
      amountMinor: index % 5 === 0 ? 250000 : -1250 - index,
      currency: "EUR",
      payee: index % 3 === 0 ? "Bar Centrale" : `Merchant ${index}`,
      description: "CARD PURCHASE",
      userNote: index % 7 === 0 ? "espresso with Luca" : `note ${index}`,
      status: "booked",
      source: "csv-import",
      tagIds: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  return transactions;
}

async function measureKdf(name: string, params: KdfParams): Promise<void> {
  const samples: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    const start = performance.now();
    const { header } = await createVaultHeader(PASSPHRASE, params);
    await unlockVaultHeader(header, PASSPHRASE);
    samples.push(performance.now() - start);
  }
  console.log(
    `KDF  ${name.padEnd(28)} derive+unwrap ${mean(samples).toFixed(1)} ms  (memory ${params.memoryCostKiB} KiB, t=${params.timeCost})`,
  );
}

async function measureEngine(engine: StorageEngine): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), `flowly-bench-${engine}-`));
  const archivePath = join(dir, "export.flowly");
  const csvPath = join(dir, "transactions.csv");
  try {
    const t0 = performance.now();
    const vault = await Vault.create(dir, PASSPHRASE, { engine, kdf: INTERACTIVE_KDF_PARAMS });
    const createMs = performance.now() - t0;

    const transactions = makeTransactions(RECORDS, "acct-1");
    const insertStart = performance.now();
    await vault.transaction(async () => {
      for (const transaction of transactions) {
        await vault.putTransaction(transaction);
      }
    });
    const insertMs = performance.now() - insertStart;

    const readStart = performance.now();
    const read = await vault.listTransactions();
    const readMs = performance.now() - readStart;
    if (read.length !== RECORDS) throw new Error(`expected ${RECORDS} records, read ${read.length}`);

    const csvStart = performance.now();
    await vault.exportTransactionCsv(csvPath);
    const csvMs = performance.now() - csvStart;

    const archiveStart = performance.now();
    await vault.exportArchive(archivePath, ARCHIVE_PASSWORD);
    const archiveMs = performance.now() - archiveStart;

    const stats = await vault.stats();
    await vault.lock();

    console.log(
      [
        `ENGINE ${engine}`,
        `  create vault          ${createMs.toFixed(1)} ms`,
        `  insert ${RECORDS} tx     ${insertMs.toFixed(1)} ms  (${Math.round((RECORDS / insertMs) * 1000)} tx/s)`,
        `  read ${RECORDS} tx       ${readMs.toFixed(1)} ms`,
        `  export CSV            ${csvMs.toFixed(1)} ms  (${(statSync(csvPath).size / 1024).toFixed(1)} KiB)`,
        `  export archive        ${archiveMs.toFixed(1)} ms  (${(statSync(archivePath).size / 1024).toFixed(1)} KiB)`,
        `  vault size on disk    ${(stats.bytesOnDisk / 1024).toFixed(1)} KiB`,
        `  encryption            ${Object.values(stats.details).join(" | ")}`,
      ].join("\n"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`Flowly Phase 0 spike benchmark — node ${process.version} ${process.platform}/${process.arch}`);
console.log(`records per engine: ${RECORDS}\n`);
await measureKdf("owasp minimum 19 MiB t=2", DEFAULT_KDF_PARAMS);
await measureKdf("interactive 46 MiB t=1", INTERACTIVE_KDF_PARAMS);
await measureKdf("hardened 64 MiB t=3", HARDENED_KDF);
console.log("");
await measureEngine("sqlcipher");
console.log("");
await measureEngine("record-encryption");
