# ADR 0015 — Remove recurring rules

Status: Accepted (2026-09-11)

## Context

Recurring transactions were designed as a later phase: the repository carried a
`RecurringRule` schema, fixture, domain model, storage table and repository, a
`recurringRuleId` field on transactions and a `recurring-rule` transaction
source — while occurrence generation, the API and the UI were never built. The
placeholder surfaced in places users actually see, such as an always-empty
`recurring_rules.csv` inside both portable exports and a dashboard promise the
product cannot keep.

The same situation as the budget removal (`docs/adr/0010`): vocabulary for a
feature nobody can use. The product decision is to drop recurring transactions
from the scope.

## Decision

- Delete the recurring domain, its contract schema and fixture, the storage
  table and repository, the `recurringRuleId` transaction field and the
  `recurring-rule` transaction source.
- Drop the table forward-only with migration 4, so vaults created before the
  removal keep opening with the same passphrase.
- Remove `recurring_rules.csv` from the complete archive and from the plain-text
  tables ZIP. Archives written earlier still carry the file (usually empty):
  import ignores it instead of failing.
- Delete the planned phase from `docs/PLAN.md`. The remaining phase numbers stay
  as published so the phases already recorded in ADRs and security documents
  keep pointing at the same work.

## Consequences

- No empty recurring CSV appears in an export, and no contract advertises a
  record type the server cannot create.
- `SCHEMA_VERSION` becomes 4. Existing vaults migrate automatically; the
  placeholder rows are dropped, which is safe because no shipped code could
  write them.
- Transaction sources are now `manual`, `csv-import` and `enable-banking`; the
  `recurringRuleId` field is gone from `transaction.schema.json`, so the
  generated TypeScript types shrink with it.
- Reintroducing scheduled transactions later means a new ADR, a new contract
  version and a new migration, not resurrecting this table.
