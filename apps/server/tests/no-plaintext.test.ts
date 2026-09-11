import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAccount } from "../src/domain/account.js";
import { createTransaction } from "../src/domain/transaction.js";
import { Vault } from "../src/vault/vault.js";
import { cleanup, tempDir, TEST_KDF } from "./helpers/test-utils.js";

const SECRETS = ["Acme Corp", "Bar Centrale", "espresso with Luca", "CARD PURCHASE"];
const ACCOUNT_ID = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
const NOW = "2026-09-01T08:00:00.000Z";

function readAllFiles(dir: string): Buffer[] {
  const files: Buffer[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...readAllFiles(path));
    else if (entry.isFile() && statSync(path).size > 0) files.push(readFileSync(path));
  }
  return files;
}

async function seedVault(engine: "sqlcipher" | "record-encryption", dir: string): Promise<void> {
  const vault = await Vault.create(dir, "correct horse battery staple", { engine, kdf: TEST_KDF });
  await vault.accounts.create(
    createAccount(
      { name: "Acme Corp", type: "checking", defaultCurrency: "EUR" },
      { id: ACCOUNT_ID, now: NOW },
    ),
  );
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
      },
      { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70", now: NOW },
    ),
  );
  await vault.lock();
}

describe("vault on disk", () => {
  it("stores no plaintext and no SQLite header with SQLCipher", async () => {
    const dir = tempDir();
    try {
      await seedVault("sqlcipher", dir);
      const files = readAllFiles(dir);
      expect(files.length).toBeGreaterThanOrEqual(2);
      for (const secret of SECRETS) {
        for (const file of files) {
          expect(file.includes(Buffer.from(secret, "utf8")), secret).toBe(false);
        }
      }
      for (const file of files) {
        expect(file.includes(Buffer.from("SQLite format 3", "utf8"))).toBe(false);
      }
    } finally {
      cleanup(dir);
    }
  });

  it("hides payloads in the fallback engine while keeping the SQLite structure", async () => {
    const dir = tempDir();
    try {
      await seedVault("record-encryption", dir);
      const files = readAllFiles(dir);
      for (const secret of ["Bar Centrale", "espresso with Luca", "CARD PURCHASE"]) {
        for (const file of files) {
          expect(file.includes(Buffer.from(secret, "utf8")), secret).toBe(false);
        }
      }
      const database = readFileSync(join(dir, Vault.databaseFile));
      expect(database.includes(Buffer.from("SQLite format 3", "utf8"))).toBe(true);
    } finally {
      cleanup(dir);
    }
  });
});
