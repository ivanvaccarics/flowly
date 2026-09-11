/**
 * Phase 0 container smoke test. Runs the vault lifecycle inside the image so
 * the Phase 0 exit criteria can be verified on a real Docker platform.
 *
 * Usage: node docker/smoke.ts <create|reopen|verify|delete>
 */
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { StorageEngine } from "../src/vault/vault.ts";
import { Vault } from "../src/vault/vault.ts";

const mode = process.argv[2] ?? "create";
const vaultDir = process.env["FLOWLY_VAULT_DIR"] ?? "/vault/data";
const exportsDir = process.env["FLOWLY_EXPORTS_DIR"] ?? "/vault/exports";
const passphrase = process.env["FLOWLY_PASSPHRASE"] ?? "smoke test passphrase";
const archivePassword = process.env["FLOWLY_ARCHIVE_PASSWORD"] ?? "smoke archive password";
const engine = (process.env["FLOWLY_ENGINE"] ?? "sqlcipher") as StorageEngine;
const archivePath = join(exportsDir, "smoke-export.flowly");
const csvPath = join(exportsDir, "smoke-transactions.csv");
const SECRETS = ["Bar Centrale", "espresso with Luca", "Smoke Testing Corp"];

function scanForPlaintext(dir: string): { files: number; leaks: string[] } {
  const leaks: string[] = [];
  let files = 0;
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.isFile() || statSync(path).size === 0) continue;
      // The CSV export and the archive are deliberate user-facing outputs.
      if (path.endsWith(".csv") || path.endsWith(".flowly")) continue;
      files += 1;
      const content = readFileSync(path);
      for (const secret of SECRETS) {
        if (content.includes(Buffer.from(secret, "utf8"))) leaks.push(`${path}:${secret}`);
      }
    }
  };
  walk(dir);
  return { files, leaks };
}

const now = new Date().toISOString();
const started = performance.now();

if (mode === "create") {
  await Vault.destroy(vaultDir);
  const vault = await Vault.create(vaultDir, passphrase, { engine });
  await vault.putAccount({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Smoke Testing Corp",
    type: "checking",
    defaultCurrency: "EUR",
    createdAt: now,
    updatedAt: now,
  });
  await vault.putTransaction({
    id: "33333333-3333-4333-8333-333333333333",
    accountId: "11111111-1111-4111-8111-111111111111",
    bookingDate: "2026-09-01",
    amountMinor: -1230,
    currency: "EUR",
    payee: "Bar Centrale",
    userNote: "espresso with Luca",
    status: "booked",
    source: "manual",
    tagIds: [],
    createdAt: now,
    updatedAt: now,
  });
  await vault.lock();
  const scan = scanForPlaintext(vaultDir);
  console.log(
    JSON.stringify({
      mode,
      engine,
      vaultId: vault.header.vaultId,
      plaintextScan: scan,
      ms: Math.round(performance.now() - started),
    }),
  );
  if (scan.leaks.length > 0) process.exit(1);
  process.exit(0);
}

if (mode === "reopen") {
  mkdirSync(exportsDir, { recursive: true });
  const vault = await Vault.open(vaultDir, passphrase, { engine });
  const transactions = await vault.listTransactions();
  const csv = await vault.exportTransactionCsv(csvPath);
  const archive = await vault.exportArchive(archivePath, archivePassword);
  const stats = await vault.stats();
  await vault.lock();
  console.log(
    JSON.stringify({
      mode,
      engine,
      vaultId: vault.header.vaultId,
      transactions: transactions.length,
      firstTransactionId: transactions[0]?.id ?? null,
      csv,
      archive,
      schemaVersion: stats.schemaVersion,
      ms: Math.round(performance.now() - started),
    }),
  );
  if (transactions.length !== 1) process.exit(1);
  process.exit(0);
}

if (mode === "verify") {
  const scratch = join(exportsDir, "verify-target");
  await Vault.destroy(scratch);
  const target = await Vault.create(scratch, passphrase, { engine });
  const imported = await target.importArchive(archivePath, archivePassword);
  await target.lock();
  await Vault.destroy(scratch);
  console.log(
    JSON.stringify({ mode, engine, imported, ms: Math.round(performance.now() - started) }),
  );
  if (imported.transactions !== 1) process.exit(1);
  process.exit(0);
}

if (mode === "delete") {
  await Vault.destroy(vaultDir);
  console.log(JSON.stringify({ mode, engine, exists: Vault.exists(vaultDir) }));
  process.exit(0);
}

console.error(`unknown mode: ${mode}`);
process.exit(2);
