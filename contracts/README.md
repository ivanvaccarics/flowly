# Canonical contracts

`contracts/` is the language-neutral source of truth for persisted shapes, CSV
and archive formats, fixtures and expected results. Both the TypeScript server
and the future Dart application consume it; nothing here may depend on a
storage engine, a framework or a language runtime.

## Layout

- `schemas/` — JSON Schema (draft 2020-12) definitions of persisted entities and
  transport payloads.
- `fixtures/` — valid instances that every client must accept.
- `expected-results/` — golden outputs that every client must reproduce
  bit-for-bit, so TypeScript and Dart cannot drift.

## Versioning

- Every persisted schema carries an integer `formatVersion`; `1` covers the
  Server MVP entities.
- A breaking change requires a new format version plus a migration in the server
  and the native application. Adding an optional field is not breaking.
- Export formats are versioned separately: the transaction CSV and the complete
  portable archive both start at version `1`. Tagging rules ship inside archive
  version 1 because they land in the Server MVP; recurring rules add a new
  archive version in Phase 7.
- Generated code never replaces runtime validation, and golden vectors are
  never updated to match an implementation — the implementation must match
  them.

## Conventions

- Identifiers are UUIDv7 strings generated locally.
- Timestamps are ISO 8601 UTC strings; transaction dates are ISO 8601 calendar
  dates (`YYYY-MM-DD`).
- Money is a signed integer count of minor units plus an ISO 4217 currency
  code. Amounts are never binary floating point.
- Text comparison is Unicode NFKC-normalized and case-insensitive; display
  casing is preserved.
