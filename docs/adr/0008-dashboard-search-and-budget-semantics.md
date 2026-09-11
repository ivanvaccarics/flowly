# ADR 0008 — Dashboard, search and budget semantics

Status: Accepted (Phase 4)

## Context

Phase 4 turns stored transactions into answers: what is my balance, where did the
money go, how much of the budget is left, and how do I find one transaction among
thousands. Each of those answers can quietly mislead if the rules stay implicit.

## Decision

- **Minor units and calendar dates only.** Every aggregate is computed from
  signed integer minor units and ISO 8601 dates. No locale formatting, no local
  time-zone arithmetic and no floating-point money: results are identical on any
  host.
- **Booked transactions only.** Balances, cash flow, spending by tag and budget
  consumption ignore `pending` rows; a pending transaction is not money yet.
  Balances start from the account opening balance.
- **Never blend currencies.** Balances are reported per account and currency,
  cash flow and spending per currency, and every total carries its currency
  code. There is no implicit conversion anywhere.
- **Budgets are single-currency and filterable.** A budget has a period
  (weekly, monthly, quarterly, yearly or custom), optional account and tag
  filters, and one currency. A transaction counts when it is booked, it is an
  outflow, it falls inside the period, and it matches the filters — and either
  its own currency is the budget currency or it carries an explicit original
  amount in it. Everything else is counted as skipped and shown to the user.
- **Rollover is a single-step carry.** With rollover enabled, the unspent amount
  of the immediately preceding period (never negative) is added to the current
  limit. It does not compound across older periods, which keeps the number easy
  to explain.
- **Search narrows in SQL and refines in memory.** Account and date range use the
  indexed `ref_a`/`ref_b` columns; tag, currency, status, source, amount range
  and free text are applied afterwards. Free text is Unicode-normalized and
  case-insensitive across payee, description and notes. Results are ordered by
  booking date and id so pagination stays stable.
- **Aggregates may be cached in memory only.** The dashboard cache is keyed by a
  cheap per-table fingerprint (count plus latest update) and lives in process
  memory; nothing derived from decrypted data is written anywhere, and a write
  invalidates the cache by changing the fingerprint.

## Consequences

- The dashboard response is part of the contracts (`dashboard.schema.json`) and
  is validated before it leaves the API, so the TypeScript and Dart clients
  cannot drift on its shape.
- Users see why a budget total differs from "all spending": other currencies are
  reported as skipped instead of being converted silently.
- Searching a large vault stays interactive because the expensive narrowing
  happens on indexed columns and the in-memory pass only sees the candidates.
