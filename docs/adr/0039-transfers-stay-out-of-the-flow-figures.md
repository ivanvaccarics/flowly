# ADR 0039 — Transfers between the user's own accounts stay out of the flow figures

Status: Accepted (2026-09-24)

## Context

Money moved between two accounts the same person owns is not income and not
spending: it is one amount seen from both sides. Flowly had no way to say so, so
a monthly transfer to a savings account counted once as an expense on the
current account, once as income on the savings account, and appeared in the
spending breakdown under whatever tag it carried. The dashboard's own figures —
income, expenses, the net, the weekly and monthly bars and the spending per tag
— all come from the same reading of every booked movement
(`apps/server/src/application/analytics.ts`), and none of them could be told
that the money had not left the household.

The vault also had no place to record such a statement, and the bank does not
make one: Enable Banking reports the two legs independently, each with the
payee of the other account and no field that says "these two belong together".

## Decision

- **One optional flag on the transaction: `transfer`.** A movement that only
  moves money between the user's own accounts carries `transfer: true`.
- **Three states, not two.** Absent means nobody has decided yet, `true` means
  it is a transfer, and `false` means the user looked at it and said it is not.
  The distinction is what lets a rule decide for the rows nobody has touched —
  the subject of the next decision — without ever overwriting a human answer.
  Clearing the field hands the row back to the rules.
- **The flow figures skip it, everything else keeps it.** `flowOf`,
  `weeklyBuckets`, `monthlyBuckets` and `spendingOf` ignore `transfer: true`.
  The ledger, the search, the tag usage, the balances and every export count the
  movement as before: the money really moved, and a bank-linked balance already
  contains it (ADR 0019).
- **The flag travels.** It is part of the canonical transaction contract
  (`contracts/schemas/transaction.schema.json`) and of the transaction CSV, as a
  last column holding `true`, `false` or nothing. A CSV written before the
  column existed imports its rows as undecided; a cell that is neither word
  fails the row instead of being guessed at.
- **The user can set it by hand, today.** The movement form offers three
  choices — **Automatic**, **Between my accounts**, **Not a transfer** — and the
  ledger shows a `transfer` chip on the rows that are one, so a wrong answer is
  visible rather than silent.

## Consequences

- A month with one 500 € transfer between two own accounts reports income and
  expenses that are 500 € lower than before, which is the point: those figures
  now answer "what did I earn and spend", not "what moved".
- The dashboard and the bank balance can disagree by design for a linked
  account, exactly as they already do for a manual movement (ADR 0019). The
  transfer flag never changes a balance.
- `analytics.test.ts` pins the behaviour: adding both legs of a tagged transfer
  leaves `cashFlow`, `cashFlowBuckets` and `spendingByTag` byte-identical while
  the account's balance and movement count move.
- Nothing decides the flag automatically yet. `docs/adr/0040` records the rules
  that do it, and they only ever write where the field is absent.
