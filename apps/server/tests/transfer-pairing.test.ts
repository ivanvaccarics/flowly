import { describe, expect, it } from "vitest";
import { TransferPairingService } from "../src/application/transfer-pairing-service.js";
import { createAccount } from "../src/domain/account.js";
import { generateId } from "../src/domain/ids.js";
import { createTransaction, type Transaction } from "../src/domain/transaction.js";
import { MAX_GAP_DAYS, pairTransfers, type TransferLeg } from "../src/domain/transfer-pairing.js";
import { Vault } from "../src/vault/vault.js";
import { cleanup, tempDir, TEST_KDF } from "./helpers/test-utils.js";

const NOW = "2026-09-01T08:00:00.000Z";
const IBAN_A = "IT60X0542811101000000123456";
const IBAN_B = "IT60X0542811101000000987654";
const IBAN_ELSEWHERE = "IT60X0542811101000000111111";

const accountA = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
const accountB = "018f2c1e-6d5b-7c3a-9f2e-1b2c3d4e5f70";

const id = (suffix: number): string =>
  `018f2c1e-6d5b-7c3a-9f2e-${String(suffix).padStart(12, "0")}`;

function leg(overrides: Partial<TransferLeg> & Pick<TransferLeg, "accountId" | "amountMinor">) {
  return {
    id: overrides.id ?? generateId(),
    bookingDate: "2026-09-01",
    currency: "EUR",
    ...overrides,
  } satisfies TransferLeg;
}

function pairOf(pairs: ReturnType<typeof pairTransfers>, outgoingId: string, incomingId: string) {
  return pairs.find((pair) => pair.outgoing.id === outgoingId && pair.incoming.id === incomingId);
}

describe("transfer pairing, the matching itself", () => {
  it("pairs equal-and-opposite legs on two accounts inside the window", () => {
    const outgoing = leg({ id: id(1), accountId: accountA, amountMinor: -50000 });
    const incoming = leg({
      id: id(2),
      accountId: accountB,
      amountMinor: 50000,
      bookingDate: "2026-09-02",
    });
    const pairs = pairTransfers([outgoing, incoming], { ownIbansByAccount: new Map() });
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.outgoing.id).toBe(outgoing.id);
    expect(pairs[0]?.incoming.id).toBe(incoming.id);
    expect(pairs[0]?.method).toBe("amount");
    expect(pairs[0]?.gapDays).toBe(1);
  });

  it("refuses unequal amounts, one account, another currency and a gap beyond the window", () => {
    const base = { id: id(3), accountId: accountA, amountMinor: -50000 };
    const variants: TransferLeg[][] = [
      // Unequal amounts.
      [leg(base), leg({ id: id(4), accountId: accountB, amountMinor: 49000 })],
      // The same account on both sides.
      [leg(base), leg({ id: id(5), accountId: accountA, amountMinor: 50000 })],
      // Another currency.
      [leg(base), leg({ id: id(6), accountId: accountB, amountMinor: 50000, currency: "USD" })],
      // One day past the window.
      [
        leg(base),
        leg({
          id: id(7),
          accountId: accountB,
          amountMinor: 50000,
          bookingDate: `2026-09-0${MAX_GAP_DAYS + 2}`,
        }),
      ],
    ];
    for (const legs of variants) {
      expect(pairTransfers(legs, { ownIbansByAccount: new Map() })).toEqual([]);
    }
  });

  it("is the exact maximum-weight matching, not the closest-date pick", () => {
    // Two outgoing and two incoming legs of the same amount. The closest pair is
    // O2↔I1, but taking it strands O1, whose only candidate is I1. The best
    // overall set is the two pairs, and that is what the matching must return.
    const o1 = leg({ id: id(10), accountId: accountA, amountMinor: -50000 });
    const o2 = leg({
      id: id(11),
      accountId: accountA,
      amountMinor: -50000,
      bookingDate: "2026-09-02",
    });
    const i1 = leg({
      id: id(12),
      accountId: accountB,
      amountMinor: 50000,
      bookingDate: "2026-09-03",
    });
    const i2 = leg({
      id: id(13),
      accountId: accountB,
      amountMinor: 50000,
      bookingDate: "2026-09-05",
    });
    const pairs = pairTransfers([o1, o2, i1, i2], { ownIbansByAccount: new Map() });
    expect(pairs).toHaveLength(2);
    expect(pairOf(pairs, o1.id, i1.id)).toBeDefined();
    expect(pairOf(pairs, o2.id, i2.id)).toBeDefined();
  });

  it("prefers the pair both banks corroborated over a closer amount-only one", () => {
    const outgoing = leg({
      id: id(20),
      accountId: accountA,
      amountMinor: -50000,
      counterpartyIban: IBAN_B,
    });
    const corroborated = leg({
      id: id(21),
      accountId: accountB,
      amountMinor: 50000,
      bookingDate: "2026-09-03",
      counterpartyIban: IBAN_A,
    });
    const closer = leg({
      id: id(22),
      accountId: accountB,
      amountMinor: 50000,
    });
    const ownIbans = new Map([
      [accountA, [IBAN_A]],
      [accountB, [IBAN_B]],
    ]);
    const pairs = pairTransfers([outgoing, corroborated, closer], { ownIbansByAccount: ownIbans });
    expect(pairOf(pairs, outgoing.id, corroborated.id)?.method).toBe("iban");
    expect(pairOf(pairs, outgoing.id, closer.id)).toBeUndefined();
  });

  it("reaches the best total across a whole ambiguous group", () => {
    // Three legs a side, same amount, all inside the window. The best total is
    // 302 of evidence; a greedy walk from the closest date does not get there.
    const outgoing = ["2026-09-01", "2026-09-02", "2026-09-03"].map((bookingDate, index) =>
      leg({ id: id(80 + index), accountId: accountA, amountMinor: -50000, bookingDate }),
    );
    const incoming = ["2026-09-03", "2026-09-04", "2026-09-06"].map((bookingDate, index) =>
      leg({ id: id(83 + index), accountId: accountB, amountMinor: 50000, bookingDate }),
    );
    const pairs = pairTransfers([...outgoing, ...incoming], { ownIbansByAccount: new Map() });
    expect(pairs).toHaveLength(3);
    expect(pairs.reduce((total, pair) => total + pair.confidence, 0)).toBe(302);
  });

  it("refuses a leg naming an account it knows belongs to someone else", () => {
    const outgoing = leg({
      id: id(30),
      accountId: accountA,
      amountMinor: -50000,
      counterpartyIban: IBAN_ELSEWHERE,
    });
    const incoming = leg({ id: id(31), accountId: accountB, amountMinor: 50000 });
    const ownIbans = new Map([[accountB, [IBAN_B]]]);
    expect(pairTransfers([outgoing, incoming], { ownIbansByAccount: ownIbans })).toEqual([]);
  });

  it("falls back to the named counterparty when there is no IBAN to compare", () => {
    const outgoing = leg({
      id: id(40),
      accountId: accountA,
      amountMinor: -50000,
      counterpartyIban: IBAN_B,
    });
    const incoming = leg({ id: id(41), accountId: accountB, amountMinor: 50000 });
    const pairs = pairTransfers([outgoing, incoming], { ownIbansByAccount: new Map() });
    expect(pairs[0]?.method).toBe("counterparty");
  });

  it("gives every movement at most one partner and repeats itself exactly", () => {
    const outgoing = leg({ id: id(50), accountId: accountA, amountMinor: -50000 });
    const first = leg({ id: id(51), accountId: accountB, amountMinor: 50000 });
    const second = leg({
      id: id(52),
      accountId: accountB,
      amountMinor: 50000,
      bookingDate: "2026-09-02",
    });
    const pairs = pairTransfers([outgoing, first, second], { ownIbansByAccount: new Map() });
    expect(pairs).toHaveLength(1);
    const again = pairTransfers([second, outgoing, first], { ownIbansByAccount: new Map() });
    expect(again.map((pair) => [pair.outgoing.id, pair.incoming.id])).toEqual(
      pairs.map((pair) => [pair.outgoing.id, pair.incoming.id]),
    );
  });
});

async function setupVault(prefix: string) {
  const dir = tempDir(prefix);
  const vault = await Vault.create(dir, "correct horse battery staple", { kdf: TEST_KDF });
  for (const [accountId, name] of [
    [accountA, "Everyday"],
    [accountB, "Savings"],
  ] as const) {
    await vault.accounts.create(
      createAccount(
        { name, type: "checking", defaultCurrency: "EUR" },
        { id: accountId, now: NOW },
      ),
    );
  }
  return { dir, vault, pairing: new TransferPairingService({ vault, newId: generateId }) };
}

async function store(
  vault: Vault,
  input: {
    id: string;
    accountId: string;
    amountMinor: number;
    bookingDate?: string;
    transfer?: boolean;
    counterpartyIban?: string;
  },
): Promise<Transaction> {
  return vault.transactions.create(
    createTransaction(
      {
        accountId: input.accountId,
        bookingDate: input.bookingDate ?? "2026-09-01",
        amountMinor: input.amountMinor,
        currency: "EUR",
        payee: "Own account",
        ...(input.transfer === undefined ? {} : { transfer: input.transfer }),
        ...(input.counterpartyIban ? { counterpartyIban: input.counterpartyIban } : {}),
      },
      { id: input.id, now: NOW },
    ),
  );
}

describe("transfer pairing service", () => {
  it("marks both legs, records the evidence, and decides them only once", async () => {
    const { dir, vault, pairing } = await setupVault("flowly-pairing-");
    try {
      await store(vault, { id: id(60), accountId: accountA, amountMinor: -50000 });
      await store(vault, {
        id: id(61),
        accountId: accountB,
        amountMinor: 50000,
        bookingDate: "2026-09-02",
      });

      const report = await pairing.reconcile();
      expect(report.paired).toBe(1);
      const legs = await vault.transactions.list();
      expect(legs.every((transaction) => transaction.transfer === true)).toBe(true);
      const links = await pairing.links();
      expect(links).toHaveLength(1);
      expect(links[0]?.link.method).toBe("amount");
      expect(links[0]?.link.gapDays).toBe(1);

      // Idempotent: a second pass has nothing left to decide.
      expect((await pairing.reconcile()).paired).toBe(0);
      expect(await vault.transferLinks.count()).toBe(1);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("never overwrites a flag the user set", async () => {
    const { dir, vault, pairing } = await setupVault("flowly-pairing-decided-");
    try {
      await store(vault, {
        id: id(62),
        accountId: accountA,
        amountMinor: -50000,
        transfer: false,
      });
      await store(vault, { id: id(63), accountId: accountB, amountMinor: 50000 });

      expect((await pairing.reconcile()).paired).toBe(0);
      const legs = await vault.transactions.list();
      const decided = legs.find((transaction) => transaction.id === id(62));
      const undecided = legs.find((transaction) => transaction.id === id(63));
      expect(decided?.transfer).toBe(false);
      expect(undecided).not.toHaveProperty("transfer");
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("pairs a leg that arrives later with the one already stored", async () => {
    const { dir, vault, pairing } = await setupVault("flowly-pairing-later-");
    try {
      await store(vault, { id: id(64), accountId: accountA, amountMinor: -50000 });
      expect((await pairing.reconcile()).paired).toBe(0);

      const second = await store(vault, {
        id: id(65),
        accountId: accountB,
        amountMinor: 50000,
        bookingDate: "2026-09-02",
      });
      expect((await pairing.reconcileAround([second])).paired).toBe(1);
      const links = await pairing.links();
      expect(links).toHaveLength(1);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("corroborates a pair through the IBANs the bank mappings carry", async () => {
    const { dir, vault, pairing } = await setupVault("flowly-pairing-iban-");
    try {
      await vault.bankAccounts.create({
        formatVersion: 1,
        revision: 1,
        id: id(66),
        linkId: id(67),
        connectionId: id(68),
        providerAccountUid: "savings-uid",
        iban: IBAN_B,
        status: "mapped",
        accountId: accountB,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await vault.bankAccounts.create({
        formatVersion: 1,
        revision: 1,
        id: id(73),
        linkId: id(67),
        connectionId: id(68),
        providerAccountUid: "everyday-uid",
        iban: IBAN_A,
        status: "mapped",
        accountId: accountA,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await store(vault, {
        id: id(69),
        accountId: accountA,
        amountMinor: -50000,
        counterpartyIban: IBAN_B,
      });
      await store(vault, {
        id: id(70),
        accountId: accountB,
        amountMinor: 50000,
        counterpartyIban: IBAN_A,
      });

      const report = await pairing.reconcile();
      expect(report.paired).toBe(1);
      expect((await pairing.links())[0]?.link.method).toBe("iban");
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("releases the pair and the partner when the user says no", async () => {
    const { dir, vault, pairing } = await setupVault("flowly-pairing-release-");
    try {
      await store(vault, { id: id(71), accountId: accountA, amountMinor: -50000 });
      await store(vault, { id: id(72), accountId: accountB, amountMinor: 50000 });
      await pairing.reconcile();

      const outgoing = (await vault.transactions.get(id(71)))!;
      await vault.transactions.update({ ...outgoing, transfer: false }, outgoing.revision);
      expect(await pairing.release(outgoing.id)).toBe(1);

      expect(await vault.transferLinks.count()).toBe(0);
      const partner = await vault.transactions.get(id(72));
      expect(partner).not.toHaveProperty("transfer");
      // With the pair released the two rows are not silently re-paired: the one
      // that said no is decided, so it can never take part again.
      expect((await pairing.reconcile()).paired).toBe(0);
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });

  it("dissolves a pair whose movements no longer match, and keeps a pair that still does", async () => {
    const { dir, vault, pairing } = await setupVault("flowly-pairing-stale-");
    try {
      await store(vault, { id: id(74), accountId: accountA, amountMinor: -50000 });
      await store(vault, { id: id(75), accountId: accountB, amountMinor: 50000 });
      await pairing.reconcile();
      expect(await vault.transferLinks.count()).toBe(1);

      // Editing the note leaves the pair exactly as valid as it was.
      const first = (await vault.transactions.get(id(74)))!;
      await vault.transactions.update({ ...first, userNote: "seen" }, first.revision);
      expect(await pairing.releaseIfStale(id(74))).toBe(0);
      expect(await vault.transferLinks.count()).toBe(1);

      // Editing the amount until the two legs no longer mirror each other does
      // not: the link goes, and neither leg is left marked by it.
      const changed = (await vault.transactions.get(id(74)))!;
      await vault.transactions.update({ ...changed, amountMinor: -30000 }, changed.revision);
      expect(await pairing.releaseIfStale(id(74))).toBe(1);
      expect(await vault.transferLinks.count()).toBe(0);
      expect(await vault.transactions.get(id(74))).not.toHaveProperty("transfer");
      expect(await vault.transactions.get(id(75))).not.toHaveProperty("transfer");
    } finally {
      await vault.lock();
      cleanup(dir);
    }
  });
});
