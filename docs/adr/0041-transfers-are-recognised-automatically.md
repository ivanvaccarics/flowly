# ADR 0041 — The two legs of an internal transfer are recognised automatically

Status: Accepted (2026-09-27). Supersedes the sentence in
[ADR 0039](./0039-transfers-stay-out-of-the-flow-figures.md) that says nothing
decides the transfer flag automatically; the flag's meaning and its three states
stand as written there.

## Context

ADR 0039 gave the transfer flag its meaning and left it to the user, by hand. A
few rows are fine that way; a year of history is not, and the shape of the
operation is regular: money leaves one account, arrives on another, the amounts
are exactly opposite, and the two banks often name the account on the other side
of the movement.

`docs/adr/0040` had tried to cover it with a second kind of user-written rule —
one condition set per leg — and was removed before release, because the guess the
user had to write down ("the payee on this side contains X") was weaker than the
evidence the vault already had in hand and never stored: the counterparty IBAN.

## Decision

- **The vault keeps the counterparty IBAN.** `counterpartyIban` travels on the
  transaction: Enable Banking's `creditor_account`/`debtor_account` on the side
  the money went to or came from, compacted and uppercased, and the
  `counterparty_iban` column of the transaction CSV. It is part of the canonical
  contract and of every export, and it is the difference between a rule that
  reads the payee and a pairing that knows.
- **Candidates are equal and opposite.** Two movements can pair when they sit on
  two different accounts, in one currency, with exactly opposite amounts in minor
  units, at most `MAX_GAP_DAYS` (3) apart. Nothing is compared approximately and
  no amount is guessed.
- **The evidence grades the pair, and a contradiction refuses it.** A pair where
  each leg names the other's account IBAN is `iban`; a pair where nobody could be
  compared but a counterparty was named is `counterparty`; a pair with no naming
  at all is `amount`. A leg that names an account the vault knows is not the
  other leg refuses the pair outright, whatever the amounts say.
- **Among ambiguous candidates the pairing is the exact maximum-weight bipartite
  matching**, not a greedy closest-date pick: one locally best pair can never
  strand a better overall set. Ties break on the tighter date and then on the
  movement ids, so the same vault always offers the same pairs.
- **Every link is recorded.** A `transfer_links` row holds the two movements,
  the method, the confidence and the gap. The link is the provenance the single
  boolean on the row cannot carry, and it is what makes a weak pairing visible
  rather than silent.
- **It runs by itself.** A bank sync and a CSV import pair the rows they wrote,
  reading across the date window so a pair completes between two runs; writing a
  movement by hand does the same; and unlocking the vault sweeps the whole
  ledger, which is how a vault that predates the feature gets its history
  marked. `POST /api/transfers/reconcile` asks for the sweep again on demand and
  `GET /api/transfers` lists what has been paired.
- **The user's answer outranks the pairing.** Only undecided rows take part, so a
  stored `true` or `false` is never overwritten. Changing a flag by hand releases
  the link it belonged to and returns the other leg to undecided, so a correction
  is not quietly paired back; clearing the flag hands the row back to the pairing
  the same way it hands it back to the rules. An edit that breaks the pair —
  another amount, account, currency or date — dissolves the link and returns both
  legs to undecided, so a link that no longer describes two movements never keeps
  them out of the figures.

## Consequences

- A wrong pair changes the flow figures, because `transfer: true` takes both legs
  out of income, expenses and spending (ADR 0039). The cost of a false positive
  is therefore real, and it is paid with one edit: the flag is visible in the
  ledger, the link and its method are readable, and the correction sticks.
- The pairing only knows what the data carries. A transfer booked with a fee, or
  across currencies, does not pair and stays undecided; a hand-entered account
  has no IBAN to compare, so its pairs fall back to the weaker evidence.
- The `transfer_links` table is not part of the portable archive. The flags
  travel in `transactions.csv`, the links are re-derived by the sweep that runs
  after an import, and an archive written before this change still imports.
- `apps/server/tests/transfer-pairing.test.ts` pins the behaviour: the exact
  matching where a closest-date pick would strand a pair, the IBAN preference,
  the refusal, the fallback, determinism, the user's `false` surviving a sweep,
  and a pair that completes between two runs.
- The matching is cubic in the larger side of one bucket, and a bucket holds one
  currency and one exact amount. Ordinary ledgers keep those buckets small; a
  pathological vault of hundreds of identical movements on the same days would
  pay for it in pairing time, never in correctness.
