# ADR 0046 — Inconsistent vault schemas are repaired forward-only

Status: Accepted (2026-10-20)

## Context

An existing vault reported that migration 6 had been applied, but its
`transfer_links` table and indexes were absent. Reads still worked because they
did not touch that table. A movement edit updated the record and then failed in
the transfer after-write step with `SQLITE_ERROR: no such table:
transfer_links`, so the client received `internal_error` after the financial
record had already changed.

Editing an accepted migration would not help a vault that has already recorded
its version. Deleting the vault or rebuilding its database would discard the
user's encrypted financial data.

## Decision

- Add migration 7, `repair-transfer-links`, as a forward-only repair.
- Recreate `transfer_links`, `transfer_links_outgoing_idx` and
  `transfer_links_incoming_idx` with `IF NOT EXISTS`.
- Do not delete, rewrite or synthesize any financial record or transfer link.
- Run the repair through the normal transactional migration path when the vault
  is unlocked.
- Keep the transfer sweep after unlock responsible for deriving any links that
  are absent from the repaired table.

## Consequences

- An incomplete version-6 schema becomes usable without manual SQL and without
  losing vault data.
- A healthy version-6 schema is also safe: `IF NOT EXISTS` preserves its table,
  indexes and existing link rows while migration 7 records the new schema
  version.
- The vault reports schema version 7 after the repair. Older server images
  cannot open a vault that has advanced to this version without an explicit
  rollback to a compatible snapshot.
- `apps/server/tests/storage.test.ts` covers both the missing-table repair and
  preservation of an existing link.
