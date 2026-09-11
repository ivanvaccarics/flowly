# ADR 0010 — Remove budgets from the Server MVP

Status: Accepted (2026-09-11). Supersedes the budget parts of
[ADR 0008](./0008-dashboard-search-and-budget-semantics.md).

## Context

Budgets shipped as part of Phase 4: a persisted entity, a contract, a dashboard
block, an API surface (`/api/budgets`, `/api/budgets/consumption`), a React
screen, and consumption maths with per-currency exclusion and single-step
rollover. The product direction has changed: budgets are out of scope, so every
trace of them has to leave the codebase and the documentation, including the
way existing vaults are handled.

## Decision

- **Remove the feature everywhere**: contract schema and fixture, domain model
  and period maths, storage table and repository, application interfaces,
  analytics consumption, API routes, React screen and dashboard block, tests and
  the acceptance run.
- **Migration 3 drops the table.** Versions 1 and 2 already ran in real vaults
  (including the developer's own), so they stay untouched and a new forward-only
  migration runs `DROP TABLE IF EXISTS budgets`. Opening an older vault applies
  it inside the usual transaction, and the vault keeps opening with the same
  passphrase and the same data.
- **The portable archive no longer carries `budgets.csv`.** Archives produced by
  the previous build still import: unknown entries are ignored, and a missing
  `budgets.csv` is no longer required. This is a compatible change to export
  format version 1, which is unreleased.
- **The dashboard keeps its other aggregates.** Balances, cash flow and spending
  by tag are unchanged; the `budgets` array disappears from the dashboard
  contract, so the Dart client will never see it.

## Consequences

- Users who had created budgets lose that screen and those numbers; the data is
  dropped by the migration and is not recoverable from the vault.
- The dependency chain gets simpler: `integrate-server-deployment` and
  `implement-server-recurring` no longer depend on a budgets task, and the
  multi-currency rules they used to share live on in the dashboard and search.
- Anyone reading ADR 0008 is pointed here, so the budget semantics are not
  mistaken for current behaviour.
