/**
 * What a transfer rule would pair in a vault. Read-only: it opens the vault,
 * reads it, prints a report and locks it again. It writes nothing.
 *
 * The passphrase comes from the environment and never from the command line, so
 * it stays out of your shell history and out of anything you paste:
 *
 *   FLOWLY_PASSPHRASE='…' pnpm --filter @flowly/server transfer-report ../../data/vault
 *   FLOWLY_PASSPHRASE='…' pnpm --filter @flowly/server transfer-report ../../data/vault --window=5
 *
 * With no directory it reads the `data/vault` of the repository, whatever
 * directory the command was started from; a path you give it is resolved
 * against the directory you are in.
 *
 * The report groups the candidate pairs by the two payees, because that is what
 * a transfer rule matches on. A signature with many pairs and the same two names
 * is a rule worth writing; a one-off pair is not, and wants the flag set by
 * hand. Every line is data read from your vault, so read the output before
 * sharing it anywhere.
 */
import { Vault } from "../src/vault/vault.js";
import { VaultKeyError } from "../src/crypto/errors.js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface Leg {
  id: string;
  account: string;
  date: string;
  amountMinor: number;
  currency: string;
  payee: string;
  description: string;
  iban?: string;
  transfer?: boolean;
}

const DEFAULT_WINDOW_DAYS = 3;
/** The vault of this checkout, so `pnpm --filter` finds it from anywhere. */
const REPOSITORY_VAULT = fileURLToPath(new URL("../../../data/vault", import.meta.url));

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function daysBetween(from: string, to: string): number {
  const millis = Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`);
  return Math.round(Math.abs(millis) / 86_400_000);
}

function money(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

function parseArgs(argv: string[]): { dir: string; window: number } {
  let dir = REPOSITORY_VAULT;
  let window = DEFAULT_WINDOW_DAYS;
  for (const arg of argv) {
    if (arg.startsWith("--window=")) {
      window = Number(arg.slice("--window=".length));
      if (!Number.isSafeInteger(window) || window < 0 || window > 30) {
        fail("--window must be a whole number of days from 0 to 30");
      }
      continue;
    }
    if (arg.startsWith("--")) fail(`unknown option: ${arg}`);
    dir = resolve(arg);
  }
  return { dir, window };
}

interface Pair {
  outgoing: Leg;
  incoming: Leg;
  days: number;
  /** Other incoming legs with the same amount inside the window. */
  ambiguousWith: number;
}

async function main(): Promise<void> {
  const { dir, window } = parseArgs(process.argv.slice(2));
  const passphrase = process.env["FLOWLY_PASSPHRASE"];
  if (!passphrase) {
    fail(
      "set the vault passphrase in the environment: FLOWLY_PASSPHRASE='…' pnpm --filter @flowly/server transfer-report <vault dir>",
    );
  }
  if (!Vault.exists(dir)) fail(`no vault at ${dir}`);

  let vault: Vault;
  try {
    // Unwrapping the key is what a wrong passphrase fails, before the database
    // is touched at all: reading a vault with the wrong key never opens it.
    vault = await Vault.open(dir, passphrase);
  } catch (error) {
    if (error instanceof VaultKeyError) fail(`${dir} did not accept that passphrase`);
    const detail = error instanceof Error ? error.message : String(error);
    fail(
      `could not open ${dir}: ${detail}` +
        (detail.includes("locked")
          ? "\nstop the server that has the vault open, then try again"
          : ""),
    );
  }
  try {
    const [accounts, transactions] = await Promise.all([
      vault.accounts.list(),
      vault.transactions.list(),
    ]);
    const accountName = new Map(accounts.map((account) => [account.id, account.name]));
    const legs: Leg[] = transactions.map((transaction) => ({
      id: transaction.id,
      account: accountName.get(transaction.accountId) ?? transaction.accountId,
      date: transaction.bookingDate,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      payee: transaction.payee ?? "",
      description: transaction.description ?? "",
      ...(transaction.counterpartyIban ? { iban: transaction.counterpartyIban } : {}),
      ...(transaction.transfer === undefined ? {} : { transfer: transaction.transfer }),
    }));

    const incomingByAmount = new Map<string, Leg[]>();
    for (const leg of legs) {
      if (leg.amountMinor <= 0) continue;
      const key = `${leg.currency}|${leg.amountMinor}`;
      const bucket = incomingByAmount.get(key);
      if (bucket) bucket.push(leg);
      else incomingByAmount.set(key, [leg]);
    }

    const pairs: Pair[] = [];
    for (const outgoing of legs) {
      if (outgoing.amountMinor >= 0) continue;
      const bucket = incomingByAmount.get(`${outgoing.currency}|${-outgoing.amountMinor}`) ?? [];
      const candidates = bucket
        .filter(
          (candidate) =>
            candidate.account !== outgoing.account &&
            daysBetween(outgoing.date, candidate.date) <= window,
        )
        .sort(
          (left, right) =>
            daysBetween(outgoing.date, left.date) - daysBetween(outgoing.date, right.date),
        );
      const incoming = candidates[0];
      if (!incoming) continue;
      pairs.push({
        outgoing,
        incoming,
        days: daysBetween(outgoing.date, incoming.date),
        ambiguousWith: candidates.length - 1,
      });
    }

    const flagged = pairs.filter(
      (pair) => pair.outgoing.transfer === true && pair.incoming.transfer === true,
    ).length;
    process.stdout.write(`Vault:      ${dir}\n`);
    process.stdout.write(`Accounts:   ${accounts.length}\n`);
    process.stdout.write(`Movements:  ${legs.length}\n`);
    process.stdout.write(`Window:     ${window} day(s)\n\n`);
    process.stdout.write(`Candidate pairs: ${pairs.length}\n`);
    process.stdout.write(`  already marked as transfers: ${flagged}\n`);
    process.stdout.write(`  still undecided:             ${pairs.length - flagged}\n\n`);

    interface Signature {
      from: string;
      to: string;
      count: number;
      example: Pair;
      outgoingIban: number;
      incomingIban: number;
      ambiguous: number;
    }
    const signatures = new Map<string, Signature>();
    for (const pair of pairs) {
      const from = pair.outgoing.payee || "—";
      const to = pair.incoming.payee || "—";
      const key = `${from.toLowerCase()}→${to.toLowerCase()}`;
      const seen = signatures.get(key) ?? {
        from,
        to,
        count: 0,
        example: pair,
        outgoingIban: 0,
        incomingIban: 0,
        ambiguous: 0,
      };
      seen.count += 1;
      if (pair.outgoing.iban) seen.outgoingIban += 1;
      if (pair.incoming.iban) seen.incomingIban += 1;
      if (pair.ambiguousWith > 0) seen.ambiguous += 1;
      signatures.set(key, seen);
    }
    const ranked = [...signatures.values()].sort((left, right) => right.count - left.count);

    process.stdout.write("Signatures: the payee that leaves → the payee that arrives\n");
    for (const signature of ranked) {
      const { outgoing, incoming } = signature.example;
      process.stdout.write(
        `  ${String(signature.count).padStart(3)}×  "${signature.from}" → "${signature.to}"\n`,
      );
      process.stdout.write(
        `        e.g. ${money(outgoing.amountMinor, outgoing.currency)} ${outgoing.date} ${outgoing.account} → ${incoming.date} ${incoming.account} (${signature.example.days}d)\n`,
      );
      process.stdout.write(
        `        counterparty IBAN present: outgoing ${signature.outgoingIban}/${signature.count}, incoming ${signature.incomingIban}/${signature.count}` +
          (signature.ambiguous > 0 ? ` · ${signature.ambiguous} with another candidate` : "") +
          "\n",
      );
      if (outgoing.description || incoming.description) {
        process.stdout.write(
          `        description: "${outgoing.description}" → "${incoming.description}"\n`,
        );
      }
    }
    if (ranked.length === 0) {
      process.stdout.write(
        "  none: no two movements match an amount across two accounts in the window\n",
      );
    }
    process.stdout.write(
      "\nA rule per signature pairs the two sides; an IBAN on both legs pairs them deterministically,\n" +
        "and the payees pair them by text. Pairs that show up once are better marked by hand.\n",
    );
  } finally {
    await vault.lock();
  }
}

await main();
