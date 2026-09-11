# ADR 0013 — Archiving an account is reversible

Status: Accepted (2026-09-11)

## Context

`POST /api/accounts/:id/archive` stamps `archivedAt` and the account disappears
from the active list, but nothing could clear that stamp: the interface hid the
action and no route re-opened it. Archiving was therefore a one-way door that
looked reversible, and the only way back was to recreate the account — which
loses its id and therefore its transactions.

## Decision

- The vault exposes `restoreAccount(id, revision)`, which clears the stamp and
  keeps the same record id, transactions, balances and rule references.
- The API exposes it as `POST /api/accounts/:id/restore`, symmetric with the
  archive route: same revision-checked body, same `{ entity }` response, same
  409 on a stale revision.
- The account card shows **Restore** for an archived account where an active one
  shows **Archive**; nothing else changes.
- Deleting an account remains the destructive, confirm-first action.

## Consequences

- Archive is a reversible "put it aside"; delete is still the only way to remove
  data, and it keeps its cascade confirmation.
- No schema change: `archivedAt` is already optional, so a restored account is
  simply an account without the stamp.
- `docs/DESIGN.md` and the manual test plan describe both directions.
