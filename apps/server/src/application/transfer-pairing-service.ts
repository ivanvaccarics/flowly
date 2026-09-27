import type { Clock } from "../domain/clock.js";
import { systemClock } from "../domain/clock.js";
import type { Transaction } from "../domain/transaction.js";
import { createTransferLink, type TransferLink } from "../domain/transfer.js";
import {
  MAX_GAP_DAYS,
  daysBetween,
  pairTransfers,
  shiftIsoDays,
  type TransferPair,
} from "../domain/transfer-pairing.js";
import type { Vault } from "../vault/vault.js";

export interface TransferPairingReport {
  /** Undecided movements the run looked at. */
  considered: number;
  /** Pairs recognised and marked on this run. */
  paired: number;
  links: TransferLink[];
}

/** A stored link with both of its movements, for the review surface. */
export interface TransferLinkView {
  link: TransferLink;
  outgoing: Transaction;
  incoming: Transaction;
}

export interface TransferPairingDependencies {
  vault: Vault;
  newId: () => string;
  clock?: Clock;
}

/**
 * Recognises the two legs of an internal transfer and marks both as transfers.
 *
 * It only ever decides rows nobody has decided yet: a `true` or `false` the
 * user stored is their answer, and no run overwrites it. A pair is written as a
 * `TransferLink` first, so the ledger keeps the evidence that joined the rows
 * (`docs/adr/0041`), and the flag on the two movements follows it.
 *
 * The pairing runs where movements arrive — a bank sync, a CSV import, a
 * movement written by hand — and once over the whole ledger when the vault is
 * unlocked, which is how a vault that predates the feature gets its history
 * marked.
 */
export class TransferPairingService {
  private readonly vault: Vault;
  private readonly newId: () => string;
  private readonly clock: Clock;

  constructor(dependencies: TransferPairingDependencies) {
    this.vault = dependencies.vault;
    this.newId = dependencies.newId;
    this.clock = dependencies.clock ?? systemClock;
  }

  /** Pairs everything undecided in the vault. */
  async reconcile(): Promise<TransferPairingReport> {
    return this.run(await this.vault.transactions.list());
  }

  /**
   * Pairs the movements given with the undecided rows that could be their other
   * leg. The other leg can book up to `MAX_GAP_DAYS` away, so the vault is read
   * across that span rather than only on the dates in hand: a movement imported
   * today often pairs with one that arrived in an earlier sync.
   */
  async reconcileAround(transactions: readonly Transaction[]): Promise<TransferPairingReport> {
    if (transactions.length === 0) return { considered: 0, paired: 0, links: [] };
    const dates = transactions.map((transaction) => transaction.bookingDate).sort();
    const first = dates[0]!;
    const last = dates[dates.length - 1]!;
    const scope = await this.vault.transactions.list({
      refBFrom: shiftIsoDays(first, -MAX_GAP_DAYS),
      refBTo: shiftIsoDays(last, MAX_GAP_DAYS),
    });
    return this.run(scope);
  }

  /** Every stored link with both movements, newest first. */
  async links(): Promise<TransferLinkView[]> {
    const [links, transactions] = await Promise.all([
      this.vault.transferLinks.list(),
      this.vault.transactions.list(),
    ]);
    const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));
    const views: TransferLinkView[] = [];
    for (const link of links) {
      const outgoing = byId.get(link.outgoingTransactionId);
      const incoming = byId.get(link.incomingTransactionId);
      if (!outgoing || !incoming) continue;
      views.push({ link, outgoing, incoming });
    }
    return views.sort((left, right) => right.link.createdAt.localeCompare(left.link.createdAt));
  }

  /**
   * The user changed a flag by hand, so the pair it belonged to is no longer
   * theirs to keep: the link goes, and the other leg returns to undecided
   * instead of staying marked by a decision that was just undone. Returns how
   * many links were released.
   */
  async release(transactionId: string): Promise<number> {
    return this.unlink(transactionId, "partner");
  }

  /**
   * A linked movement was edited until it can no longer be the pair it was —
   * its amount, its account, its currency or its date. The link goes and both
   * legs return to undecided, because neither describes the other any more.
   * Returns how many links were dissolved.
   */
  async releaseIfStale(transactionId: string): Promise<number> {
    const links = await this.linksInvolving(transactionId);
    if (links.length === 0) return 0;
    const byId = new Map(
      (await this.vault.transactions.list()).map((transaction) => [transaction.id, transaction]),
    );
    const stale = links.some((link) => {
      const outgoing = byId.get(link.outgoingTransactionId);
      const incoming = byId.get(link.incomingTransactionId);
      if (!outgoing || !incoming) return true;
      return !stillPairs(outgoing, incoming);
    });
    return stale ? this.unlink(transactionId, "both") : 0;
  }

  private async linksInvolving(transactionId: string): Promise<TransferLink[]> {
    return (await this.vault.transferLinks.list()).filter(
      (link) =>
        link.outgoingTransactionId === transactionId ||
        link.incomingTransactionId === transactionId,
    );
  }

  /**
   * Removes the links around a movement. `partner` leaves the movement's own
   * stored value alone, because the user just chose it; `both` is for a pair
   * that no longer holds, where clearing one side alone would leave the other
   * marked by a link that is gone.
   */
  private async unlink(transactionId: string, clear: "partner" | "both"): Promise<number> {
    const links = await this.linksInvolving(transactionId);
    for (const link of links) {
      await this.vault.transferLinks.delete(link.id, link.revision);
      const ids =
        clear === "both"
          ? [link.outgoingTransactionId, link.incomingTransactionId]
          : [
              link.outgoingTransactionId === transactionId
                ? link.incomingTransactionId
                : link.outgoingTransactionId,
            ];
      for (const id of ids) {
        const leg = await this.vault.transactions.get(id);
        if (!leg || leg.transfer !== true) continue;
        const released: Transaction = { ...leg };
        delete released.transfer;
        await this.vault.transactions.update(released, leg.revision);
      }
    }
    return links.length;
  }

  private async run(scope: readonly Transaction[]): Promise<TransferPairingReport> {
    const candidates = scope.filter((transaction) => transaction.transfer === undefined);
    if (candidates.length < 2) return { considered: candidates.length, paired: 0, links: [] };

    const [ownIbansByAccount, existing] = await Promise.all([
      this.ownIbansByAccount(),
      this.vault.transferLinks.list(),
    ]);
    const joined = new Set(
      existing.flatMap((link) => [link.outgoingTransactionId, link.incomingTransactionId]),
    );
    const pairs = pairTransfers(candidates, { ownIbansByAccount }).filter(
      (pair) => !joined.has(pair.outgoing.id) && !joined.has(pair.incoming.id),
    );
    if (pairs.length === 0) return { considered: candidates.length, paired: 0, links: [] };

    const links: TransferLink[] = [];
    await this.vault.transaction(async () => {
      for (const pair of pairs) {
        const written = await this.write(pair);
        if (written) links.push(written);
      }
    });
    return { considered: candidates.length, paired: links.length, links };
  }

  /**
   * Writes one pair inside the surrounding transaction. The rows are read again
   * so a flag the user set between the match and the write wins: the match is a
   * suggestion until the write confirms both legs are still undecided.
   */
  private async write(pair: TransferPair): Promise<TransferLink | undefined> {
    const outgoing = await this.vault.transactions.get(pair.outgoing.id);
    const incoming = await this.vault.transactions.get(pair.incoming.id);
    if (!outgoing || !incoming) return undefined;
    if (outgoing.transfer !== undefined || incoming.transfer !== undefined) return undefined;
    if (outgoing.amountMinor !== -incoming.amountMinor) return undefined;
    if (outgoing.accountId === incoming.accountId) return undefined;

    const now = this.clock.nowIso();
    const link = await this.vault.transferLinks.create(
      createTransferLink(
        {
          outgoingTransactionId: outgoing.id,
          incomingTransactionId: incoming.id,
          method: pair.method,
          confidence: pair.confidence,
          gapDays: pair.gapDays,
        },
        { id: this.newId(), now },
      ),
    );
    await this.vault.transactions.update({ ...outgoing, transfer: true }, outgoing.revision);
    await this.vault.transactions.update({ ...incoming, transfer: true }, incoming.revision);
    return link;
  }

  /** Every IBAN the user's own accounts are known by, from the bank mappings. */
  private async ownIbansByAccount(): Promise<Map<string, string[]>> {
    const accounts = await this.vault.bankAccounts.list();
    const byAccount = new Map<string, string[]>();
    for (const account of accounts) {
      if (!account.accountId || !account.iban) continue;
      const ibans = byAccount.get(account.accountId) ?? [];
      if (!ibans.includes(account.iban)) ibans.push(account.iban);
      byAccount.set(account.accountId, ibans);
    }
    return byAccount;
  }
}

/** True while two movements still satisfy what makes them one transfer. */
function stillPairs(outgoing: Transaction, incoming: Transaction): boolean {
  if (outgoing.accountId === incoming.accountId) return false;
  if (outgoing.currency !== incoming.currency) return false;
  if (outgoing.amountMinor !== -incoming.amountMinor) return false;
  return daysBetween(outgoing.bookingDate, incoming.bookingDate) <= MAX_GAP_DAYS;
}
