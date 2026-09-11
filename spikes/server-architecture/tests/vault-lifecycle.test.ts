import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { WrongPassphraseError, VaultLockedError, VaultNotFoundError } from "../src/errors.ts";
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

for (const engine of ["sqlcipher", "record-encryption"] as const) {
  test(`vault lifecycle create -> lock -> reopen -> delete (${engine})`, async () => {
    const dir = tempDir();
    try {
      const vault = await Vault.create(dir, PASSPHRASE, { engine, kdf: TEST_KDF });
      const vaultId = vault.header.vaultId;

      await vault.putAccount(sampleAccount());
      await vault.putTag(sampleTag());
      await vault.putTransaction(sampleTransaction());

      const stats = await vault.stats();
      assert.equal(stats.engine, engine);
      assert.deepEqual(stats.counts, { accounts: 1, transactions: 1, tags: 1, taggingRules: 0 });
      assert.equal(stats.schemaVersion, 2);
      assert.ok(stats.bytesOnDisk > 0);

      await vault.lock();
      assert.equal(vault.isUnlocked, false);
      await assert.rejects(() => vault.listTransactions(), VaultLockedError);

      const reopened = await Vault.open(dir, PASSPHRASE, { engine });
      assert.equal(reopened.header.vaultId, vaultId);
      const transactions = await reopened.listTransactions();
      assert.equal(transactions.length, 1);
      assert.equal(transactions[0]?.userNote, "espresso with Luca");
      assert.equal(transactions[0]?.amountMinor, -1230);
      await reopened.lock();

      await assert.rejects(() => Vault.open(dir, "wrong passphrase", { engine }), WrongPassphraseError);
      await assert.rejects(() => Vault.open(join(dir, "missing"), PASSPHRASE, { engine }), VaultNotFoundError);

      await Vault.destroy(dir);
      assert.equal(Vault.exists(dir), false);
    } finally {
      cleanup(dir);
    }
  });
}

test("vault header never stores the DEK or the passphrase in clear", async () => {
  const dir = tempDir();
  try {
    const vault = await Vault.create(dir, PASSPHRASE, { kdf: TEST_KDF });
    await vault.lock();
    const header = readFileSync(join(dir, Vault.headerFile), "utf8");
    assert.equal(header.includes(PASSPHRASE), false);
    assert.equal(/passphrase/i.test(header), false);
    const parsed = JSON.parse(header) as { wrappedDek: { ciphertext: string } };
    assert.ok(parsed.wrappedDek.ciphertext.length > 0);
    assert.equal(Buffer.from(parsed.wrappedDek.ciphertext, "base64").byteLength, 32);
  } finally {
    cleanup(dir);
  }
});
