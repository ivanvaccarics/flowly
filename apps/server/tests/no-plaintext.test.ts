import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAccount } from "../src/domain/account.js";
import { createTransaction } from "../src/domain/transaction.js";
import { Vault } from "../src/vault/vault.js";
import { testPrivateKeyPem } from "./helpers/banking.js";
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
  it("keeps Enable Banking credentials and raw payloads encrypted", async () => {
    const dir = tempDir();
    try {
      const vault = await Vault.create(dir, "correct horse battery staple", {
        engine: "sqlcipher",
        kdf: TEST_KDF,
      });
      await vault.bankConnections.create({
        formatVersion: 1,
        revision: 1,
        id: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
        provider: "enable-banking",
        appId: "11111111-1111-4111-8111-111111111111",
        privateKeyPem: testPrivateKeyPem(),
        redirectUrl: "https://flowly.test/enablebanking/auth_callback",
        environment: "SANDBOX",
        psuType: "personal",
        country: "IT",
        autoSync: true,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await vault.bankPayloads.create({
        formatVersion: 1,
        revision: 1,
        id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70",
        connectionId: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
        linkId: "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081",
        providerAccountUid: "0f7d3d1c-3f4e-4b0e-9f1a-2b3c4d5e6f70",
        kind: "transactions",
        fetchedAt: NOW,
        json: { remittance_information: ["PAGAMENTO MAV Bar Centrale"] },
        createdAt: NOW,
        updatedAt: NOW,
      });
      await vault.lock();

      for (const file of readAllFiles(dir)) {
        expect(file.includes(Buffer.from("BEGIN PRIVATE KEY", "utf8"))).toBe(false);
        expect(file.includes(Buffer.from("BAR CENTRALE MAV", "utf8"))).toBe(false);
      }
    } finally {
      cleanup(dir);
    }
  });

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
