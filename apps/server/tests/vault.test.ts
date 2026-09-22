import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VaultKeyError } from "../src/crypto/errors.js";
import { isVaultHeader, unlockVaultHeader, zeroize } from "../src/crypto/envelope.js";
import { createAccount } from "../src/domain/account.js";
import { createTag } from "../src/domain/tag.js";
import { createTransaction } from "../src/domain/transaction.js";
import { ConflictError, RecordNotFoundError } from "../src/storage/errors.js";
import { openStore } from "../src/storage/store.js";
import {
  Vault,
  VaultExistsError,
  VaultLockedError,
  VaultNotFoundError,
} from "../src/vault/vault.js";
import { cleanup, tempDir, TEST_KDF } from "./helpers/test-utils.js";

const PASSPHRASE = "correct horse battery staple";
const ACCOUNT_ID = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
const NOW = "2026-09-01T08:00:00.000Z";

describe.each(["sqlcipher", "record-encryption"] as const)("vault lifecycle (%s)", (engine) => {
  it("creates, locks, reopens and deletes a vault", async () => {
    const dir = tempDir();
    try {
      const vault = await Vault.create(dir, PASSPHRASE, { engine, kdf: TEST_KDF });
      const vaultId = vault.header.vaultId;
      expect(vault.isUnlocked).toBe(true);
      expect((await vault.status()).state).toBe("unlocked");

      await vault.accounts.create(
        createAccount(
          { name: "Everyday", type: "checking", defaultCurrency: "EUR" },
          { id: ACCOUNT_ID, now: NOW },
        ),
      );

      await vault.lock();
      expect(vault.isUnlocked).toBe(false);
      await expect(vault.accounts.list()).rejects.toThrow(VaultLockedError);
      expect((await vault.status()).state).toBe("locked");

      await expect(Vault.open(dir, "wrong passphrase", { engine })).rejects.toThrow(VaultKeyError);

      const reopened = await Vault.open(dir, PASSPHRASE, { engine });
      expect(reopened.header.vaultId).toBe(vaultId);
      expect(await reopened.accounts.count()).toBe(1);
      const stats = await reopened.stats();
      expect(stats.engine).toBe(engine);
      expect(stats.schemaVersion).toBe(5);
      await reopened.lock();

      await Vault.destroy(dir);
      expect(Vault.exists(dir)).toBe(false);
      await expect(Vault.open(dir, PASSPHRASE, { engine })).rejects.toThrow(VaultNotFoundError);
    } finally {
      cleanup(dir);
    }
  });

  it("upgrades tagging rules stored before format version 2", async () => {
    const dir = tempDir();
    const ruleId = "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7081";
    try {
      const created = await Vault.create(dir, PASSPHRASE, { engine, kdf: TEST_KDF });
      await created.lock();

      // The v1 record goes in behind the validator, exactly as an old vault holds it.
      const header = JSON.parse(readFileSync(join(dir, Vault.headerFile), "utf8")) as unknown;
      if (!isVaultHeader(header)) throw new Error("the test vault header is not a header");
      const dek = await unlockVaultHeader(header, PASSPHRASE);
      const store = await openStore(engine, join(dir, Vault.databaseFile), dek);
      await store.insert("tagging_rules", ruleId, {
        formatVersion: 1,
        revision: 1,
        id: ruleId,
        name: "Rent",
        enabled: true,
        combinator: "and",
        conditions: [
          { field: "amountMinor", operator: "lessThan", value: -50000, currency: "EUR" },
        ],
        tagIds: ["018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081"],
        createdAt: NOW,
        updatedAt: NOW,
      });
      await store.close();
      zeroize(dek);

      const reopened = await Vault.open(dir, PASSPHRASE, { engine });
      const [rule] = await reopened.taggingRules.list();
      expect(rule?.formatVersion).toBe(2);
      expect(rule?.conditions).toEqual([
        { field: "amount", operator: "lessThan", value: "-500.00", currency: "EUR" },
      ]);
      expect(rule?.revision).toBe(2);
      await reopened.lock();
    } finally {
      cleanup(dir);
    }
  });
});

describe("vault service", () => {
  it("refuses to create a second vault in the same directory", async () => {
    const dir = tempDir();
    try {
      const vault = await Vault.create(dir, PASSPHRASE, { kdf: TEST_KDF });
      await vault.lock();
      await expect(Vault.create(dir, PASSPHRASE, { kdf: TEST_KDF })).rejects.toThrow(
        VaultExistsError,
      );
    } finally {
      cleanup(dir);
    }
  });

  it("changes the passphrase without re-encrypting data", async () => {
    const dir = tempDir();
    try {
      const vault = await Vault.create(dir, PASSPHRASE, { kdf: TEST_KDF });
      await vault.accounts.create(
        createAccount(
          { name: "Everyday", type: "checking", defaultCurrency: "EUR" },
          { id: ACCOUNT_ID, now: NOW },
        ),
      );
      await vault.changePassphrase(PASSPHRASE, "a brand new passphrase");
      await vault.lock();

      await expect(Vault.open(dir, PASSPHRASE)).rejects.toThrow(VaultKeyError);
      const reopened = await Vault.open(dir, "a brand new passphrase");
      expect(await reopened.accounts.count()).toBe(1);
      await expect(
        reopened.changePassphrase("not the current passphrase", "another"),
      ).rejects.toThrow(VaultKeyError);
      await reopened.lock();
    } finally {
      cleanup(dir);
    }
  });

  it("keeps revisions checked per repository and snapshots encrypted", async () => {
    const dir = tempDir();
    try {
      const vault = await Vault.create(dir, PASSPHRASE, { kdf: TEST_KDF });
      const account = await vault.accounts.create(
        createAccount(
          { name: "Everyday", type: "checking", defaultCurrency: "EUR" },
          { id: ACCOUNT_ID, now: NOW },
        ),
      );
      const updated = await vault.accounts.update({ ...account, name: "Renamed" }, 1);
      expect(updated.revision).toBe(2);
      await expect(vault.accounts.update(account, 1)).rejects.toThrow(ConflictError);
      await expect(vault.accounts.delete(ACCOUNT_ID, 1)).rejects.toThrow(ConflictError);
      await vault.accounts.delete(ACCOUNT_ID, 2);
      await expect(vault.accounts.update(account, 2)).rejects.toThrow(RecordNotFoundError);

      const tag = await vault.tags.create(
        createTag({ name: "Groceries" }, { id: "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081", now: NOW }),
      );
      await expect(
        vault.tags.create(
          createTag(
            { name: "groceries" },
            { id: "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7082", now: NOW },
          ),
        ),
      ).rejects.toThrow();
      expect(tag.normalizedName).toBe("groceries");

      await vault.transactions.create(
        createTransaction(
          {
            accountId: ACCOUNT_ID,
            bookingDate: "2026-09-03",
            amountMinor: -1230,
            currency: "EUR",
            userNote: "espresso with Luca",
          },
          { id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70", now: NOW },
        ),
      );

      const snapshot = await vault.snapshot("before-import");
      expect(existsSync(snapshot)).toBe(true);
      expect(statSync(snapshot).mode & 0o777).toBe(0o600);
      expect(readFileSync(snapshot).includes(Buffer.from("espresso with Luca"))).toBe(false);
      expect(readFileSync(join(dir, Vault.headerFile)).includes(Buffer.from(PASSPHRASE))).toBe(
        false,
      );
      expect(statSync(join(dir, Vault.headerFile)).mode & 0o777).toBe(0o600);
      await vault.lock();
    } finally {
      cleanup(dir);
    }
  });
});
