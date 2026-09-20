# ADR 0025 — A consent's daily accesses are a budget, not a throttle

Status: Accepted (2026-09-20)

Amends the refresh cadence of
[ADR 0019](./0019-bank-balance-is-the-account-balance.md); the balance
semantics there are unchanged.

## Context

PSD2 and the RTS require an ASPSP to allow at least **four** unattended reads
per account per day, and several banks grant exactly that. When the consent has
spent them the bank answers with its own error —
`ASPSP_RATE_LIMIT_EXCEEDED`, "the access on the account has been exceeding the
consented multiplicity per day" — and it refuses every further read until its
counter resets at the bank's own midnight.

Flowly treated that answer as an ordinary `429`: the connector retried it twice
with sub-second backoff, a sync kept walking through the remaining accounts
after one had been refused, and unlocking the vault refreshed every linked bank
by default. A user who unlocked a few times a day with two accounts therefore
asked for far more reads than the consent had, and spent the rest of the day
with a sync that could only fail. Retrying a spent budget is the one reaction
that cannot work, and it makes the next attempt land earlier rather than later.

## Decision

- **The daily cap is terminal, not transient.** `EnableBankingError` grows a
  `rateLimited` getter keyed on the provider's `ASPSP_RATE_LIMIT_EXCEEDED` code,
  the client throws it without retrying, and it keeps the `Retry-After` the
  provider sent when there is one. A plain `429` without that code stays
  retryable: that one is throttling, not exhaustion.
- **A refusal ends the run.** The sync stops at the account that was refused
  instead of asking the remaining accounts of that link and the links after it.
  Reading the transactions of an account whose balances were refused costs a
  request the consent no longer has.
- **The link carries the wait.** `bank_links` gains `syncBlockedUntil` and
  `syncRateLimitStreak`: the first refusal blocks the link for six hours and
  every further refusal doubles it, up to 24 hours. A link inside its wait is
  reported as `blocked` and skipped without a provider request, so the failure
  costs nothing. A sync that completes clears the wait and the escalation,
  because the bank answered again.
- **The wait is wall-clock time, not "the next bank day".** Flowly cannot see
  when the bank resets its counter, and guessing the wrong timezone would mean
  arming a wait that expires while the bank is still refusing. Doubling from a
  low start converges on the reset without needing to know it.
- **Refreshing on unlock is opt-in.** `autoSync` defaults to **off** for a new
  connection and the connection form no longer ticks it. Unlocking a vault is
  something a person does many times a day; a bank consent allows a handful of
  reads. **Sync now** on the dashboard still pulls on demand.
- **A stored `true` nobody chose is corrected once.** Connections written while
  refreshing on unlock was still the default carry `autoSync: true` with no
  record of anyone deciding it, so the first read turns it off and writes
  `autoSyncExplicit: true`. The flag is what a later deliberate "on" sets, and
  once it is there Flowly never touches the setting again: the correction can
  only ever fire on a record that predates it.
- **The UI states the reason and the next attempt.** The raw ASPSP code is
  replaced by "the bank refused the read: its daily access limit is reached"
  plus the instant Flowly will try again, both in the link's error and on the
  dashboard card.

## Consequences

- A consented day can no longer be spent by accident. `SCHEMA_VERSION` stays at
  5 because the new fields are optional members of the record JSON, so an
  existing vault opens without a migration: the connection is corrected the
  first time it is read and an existing link starts its escalation at its first
  refusal.
- A user who wants fresh numbers on every unlock can still turn the setting on,
  and a bank that refuses will still be respected for the rest of the wait.
- **Sync now** can answer "nothing was fetched" without an error, which is the
  honest answer: the vault already holds everything the bank was willing to
  give, and the ledger stays complete because the sync is resumable — the
  stored `syncFrom` cursor and the seven-day overlap mean a skipped day costs
  nothing but latency.
- Somebody who truly needs today's data can reconnect the bank: an access with
  the PSU present is authenticated, so it is not part of the unattended budget.
  That is a deliberate escape hatch, not the normal path.
- The connector now differs from a "retry everything that looks transient"
  default, so the distinction is pinned by tests: the client-level retry policy
  in `apps/server/tests/banking-client.test.ts` and the sync's stop, wait and
  recovery behaviour in `apps/server/tests/banking-sync.test.ts`.
