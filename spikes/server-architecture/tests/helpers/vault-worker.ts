/**
 * Runs in a separate process to prove the vault holds no in-memory state that a
 * restart would need. Usage: node <worker> <dir> <passphrase> <write|read>
 */
import { sampleAccount, sampleTransaction, TEST_KDF } from "./test-utils.ts";
import { Vault } from "../../src/vault/vault.ts";

const [dir, passphrase, mode] = process.argv.slice(2);
if (!dir || !passphrase || !mode) {
  console.error("usage: vault-worker <dir> <passphrase> <write|read>");
  process.exit(2);
}

const engine = (process.env["FLOWLY_SPIKE_ENGINE"] ?? "sqlcipher") as "sqlcipher";
const vault =
  mode === "write"
    ? await Vault.create(dir, passphrase, { engine, kdf: TEST_KDF })
    : await Vault.open(dir, passphrase, { engine });

if (mode === "write") {
  await vault.putAccount(sampleAccount());
  await vault.putTransaction(sampleTransaction());
  await vault.lock();
  console.log(JSON.stringify({ ok: true, vaultId: vault.header.vaultId }));
} else {
  const transactions = await vault.listTransactions();
  await vault.lock();
  console.log(JSON.stringify({ ok: true, transactions: transactions.length }));
}
