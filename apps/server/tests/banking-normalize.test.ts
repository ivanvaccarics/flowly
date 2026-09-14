import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  accountTypeFromCashAccountType,
  maskIban,
  normalizeAccount,
  normalizeTransaction,
  pickBalance,
  trimTo,
} from "../src/banking/normalize.js";
import type { EbTransaction } from "../src/banking/enable-banking-types.js";
import { sampleAccountResource, sampleBalance } from "./helpers/banking.js";

function fixture(name: string): EbTransaction {
  const path = join(import.meta.dirname, "fixtures", "banking", name);
  return JSON.parse(readFileSync(path, "utf8")) as EbTransaction;
}

describe("Enable Banking normalization", () => {
  it("maps a card payment into a signed booked transaction", () => {
    const normalized = normalizeTransaction(fixture("card-payment.json"));
    expect(normalized).toMatchObject({
      ok: true,
      bookingDate: "2026-09-01",
      valueDate: "2026-09-02",
      amountMinor: -375,
      currency: "EUR",
      payee: "Bar Centrale",
      description: "Bar Centrale Mas",
      status: "booked",
      providerTransactionId: "11112222-3333-4444-5555-666677778888",
      providerStatus: "BOOK",
    });
  });

  it("keeps an unlabelled MAV debit readable through its remittance information", () => {
    const normalized = normalizeTransaction(fixture("mav-payment.json"));
    if (!normalized.ok) throw new Error("fixture should normalize");
    expect(normalized.amountMinor).toBe(-43134);
    expect(normalized.bookingDate).toBe("2026-08-31");
    expect(normalized.payee).toContain("PAGAMENTO MAV");
    expect(normalized.status).toBe("booked");
  });

  it("prefers the creditor for debits and the debtor for credits", () => {
    const credit = normalizeTransaction({
      transaction_amount: { currency: "EUR", amount: "2500.00" },
      creditor: { name: "Bar Centrale" },
      debtor: { name: "MARIO ROSSI" },
      credit_debit_indicator: "CRDT",
      status: "BOOK",
      booking_date: "2026-09-05",
    });
    expect(credit).toMatchObject({ ok: true, amountMinor: 250000, payee: "MARIO ROSSI" });
  });

  it("treats anything that is not BOOK as pending", () => {
    const pending = normalizeTransaction(fixture("card-payment.json") as unknown as EbTransaction);
    expect(pending.ok).toBe(true);
    const normalized = normalizeTransaction({
      transaction_amount: { currency: "EUR", amount: "12.00" },
      credit_debit_indicator: "DBIT",
      status: "PDNG",
      value_date: "2026-09-10",
    });
    expect(normalized).toMatchObject({ ok: true, status: "pending", bookingDate: "2026-09-10" });
  });

  it("rejects transactions without an amount, a date or a supported currency", () => {
    expect(normalizeTransaction({ status: "BOOK", booking_date: "2026-09-01" })).toMatchObject({
      ok: false,
      reason: "missing-amount",
    });
    expect(
      normalizeTransaction({
        transaction_amount: { currency: "EUR", amount: "1.00" },
        status: "BOOK",
      }),
    ).toMatchObject({ ok: false, reason: "missing-date" });
    expect(
      normalizeTransaction({
        transaction_amount: { currency: "RON", amount: "10.00" },
        booking_date: "2026-09-01",
        status: "BOOK",
      }),
    ).toMatchObject({ ok: false, reason: "unsupported-currency" });
  });

  it("maps ASPSP account fields onto a Flowly account", () => {
    const normalized = normalizeAccount(sampleAccountResource(), { name: "UniCredit" });
    expect(normalized).toMatchObject({
      name: "Conto corrente",
      type: "checking",
      currency: "EUR",
      institutionName: "UniCredit",
      iban: "IT60X0542811101000000123456",
      cashAccountType: "CACC",
    });
    expect(maskIban(normalized.iban as string)).toBe("····3456");

    expect(accountTypeFromCashAccountType("SVGS")).toBe("savings");
    expect(accountTypeFromCashAccountType("CARD")).toBe("credit-card");
    expect(accountTypeFromCashAccountType(null)).toBe("other");
  });

  it("falls back to a masked IBAN when the bank sends no description", () => {
    const normalized = normalizeAccount(
      { account_id: { iban: "IT60X0542811101000000123456" }, cash_account_type: "CACC" },
      { name: "UniCredit" },
    );
    expect(normalized.name).toBe("UniCredit ····3456");
  });

  it("picks the accounting balance over other balance types", () => {
    const picked = pickBalance([
      sampleBalance({ balance_type: "CLAV", balance_amount: { currency: "EUR", amount: "9.99" } }),
      sampleBalance(),
      sampleBalance({ balance_type: "OTHR", balance_amount: { currency: "RON", amount: "7.00" } }),
    ]);
    expect(picked).toEqual({ minor: 123456, currency: "EUR", type: "CLBD" });
    expect(pickBalance([])).toBeUndefined();
  });

  it("clamps a remittance-only payee to the 120 characters a payee holds", () => {
    const normalized = normalizeTransaction({
      transaction_amount: { currency: "EUR", amount: "10.00" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: "2026-09-05",
      remittance_information: ["PAGAMENTO MAV ".repeat(30)],
    });
    if (!normalized.ok) throw new Error("the transaction should normalize");
    expect(normalized.payee).toBeDefined();
    expect([...(normalized.payee ?? "")].length).toBeLessThanOrEqual(120);
    expect(normalized.description?.length).toBeGreaterThan(120);
  });

  it("truncates provider text on code points", () => {
    expect(trimTo("  hello   ", 40)).toBe("hello");
    expect(trimTo("😀😀😀", 2)).toBe("😀😀");
    expect(trimTo("   ", 10)).toBeUndefined();
  });
});
