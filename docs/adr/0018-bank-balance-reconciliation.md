# ADR 0018 — Show the bank balance beside the vault balance and align it once

Status: Accepted (2026-09-14)

## Context

A paired account shows two different numbers. Settings reported the balance the
bank sent (the real one), while the ledger and the dashboard reported the
account's opening balance plus its booked movements.

Both are correct, which is exactly why they differed: the first sync imports
only the recent history the consent covers (90 days by default), so a vault that
starts from an opening balance of zero cannot reproduce a balance that includes
everything the bank has ever recorded. Nothing was broken, but the app left the
user to guess, and the number the bank considers authoritative looked wrong.

## Decision

- The banking summary reports both figures for the same account and currency:
  `lastBalanceMinor` from the provider and `ledgerBalanceMinor` computed from the
  vault (opening balance plus booked movements in that currency).
- Where the currencies differ there is no comparison to make, so the ledger
  figure is omitted rather than coerced.
- The Settings bank table shows the two figures side by side with the
  difference, and only when they differ it offers **Align**: one explicit,
  confirmed action that moves the difference into `account.openingBalanceMinor`
  — a ledger change the user asks for.
- Nothing is adjusted silently. The vault stays the canonical ledger, and the
  provider balance stays an observation recorded at each sync.

## Consequences

- After one alignment the ledger, the dashboard and the bank agree, which is
  what makes the rest of the product trustworthy; until then the UI says which
  number is which.
- The alignment is an opening-balance adjustment, not a transaction: it changes
  no movement and can be reversed by setting the opening balance back.
- Accounts whose movements Flowly cannot represent in the bank's currency keep
  the two numbers apart on purpose.
- Any future automatic reconciliation (for example in Phase 12) has to preserve
  this property: the user decides, the difference is visible, and the vault
  keeps recording what actually happened.
