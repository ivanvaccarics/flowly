# ADR 0019 — The balance a bank reports is the balance of that account

Status: Accepted (2026-09-15)

Supersedes [ADR 0018](0018-bank-balance-reconciliation.md).

## Context

ADR 0018 kept two figures side by side and let the user align them once. In
practice that asked the wrong question: a person looking at Flowly wants to know
how much money is on the account, and the only party that knows is the bank. The
vault's own arithmetic — opening balance plus imported movements — is a
reconstruction from a partial history, and presenting it as an equal answer
invited doubt about the product rather than trust in it.

## Decision

- For an account paired with a bank account through Enable Banking, the balance
  Flowly reports **is** the figure Enable Banking reported at the last sync, in
  the currency the bank sent. It is what the dashboard, Accounts, the totals and
  the bank card in Settings all show.
- Accounts with no bank link keep the figure the vault can compute: opening
  balance plus booked movements in that currency.
- A reported balance is never summed on top of the movements it already
  contains. It is a snapshot taken at `lastBalanceAt`, refreshed when the vault
  unlocks, on **Sync now**, and on every later sync.
- The comparison column, the difference and the **Align** action from ADR 0018
  are removed. `bank_accounts.lastBalanceMinor` stays the single source for the
  figure, and the dashboard aggregates read it through the analytics service.

## Consequences

- One number per account everywhere, and it is the one the bank stands behind.
- A manual transaction added to a linked account does not move its balance until
  the next sync, because the bank has not seen it yet. That is the intended
  trade-off of taking the bank's figure as the truth.
- Flowly still records what it imported, and the raw provider payloads stay per
  account, so nothing about the reconstruction is lost — it is simply no longer
  presented as the balance.
- If a bank stops reporting a balance, or the link is removed, the account falls
  back to the computed figure rather than showing a stale number with no source.
