# ADR 0007 — Cascades, tagging application points, and portability

Status: Accepted (Phase 3)

## Context

Phase 3 makes the vault usable: accounts, transactions, notes and tags are
edited from the browser, user-authored tagging rules tag incoming data, and the
whole vault moves between deployments through files the user controls. Each of
those decisions has a destructive or non-obvious failure mode.

## Decision

- **Archive before delete.** An account is archived (an `archivedAt` timestamp)
  rather than deleted while transactions reference it. A hard delete is possible
  only with `cascade=true`, and the response reports how many transactions were
  removed. Without the flag the API answers `409 account_in_use`.
- **Deleting a tag detaches it.** The default is `409 tag_in_use`; with
  `cascade=true` the tag is removed from every transaction and tagging rule in
  the same transaction, and the response reports both counts.
- **Tagging rules only add tags, and run at defined points.** Manual creation and
  CSV merge apply the rules inside the same atomic write; existing transactions
  change only through an explicit, idempotent backfill. Rules never remove tags
  and are never re-evaluated on edit, so a manual edit always wins.
- **Preview before merge.** A transaction CSV is parsed and summarised first:
  valid rows, duplicates, new tags, unknown accounts and per-line errors. The
  merge is additive, deduplicated by Flowly id, provider id or deterministic
  fingerprint, and reports exactly what happened.
- **Complete archives replace atomically.** The archive is a gzipped tar with a
  SHA-256 manifest, encrypted with AES-256-GCM under an Argon2id-derived key.
  Import validates the manifest against the canonical schema, checks that
  transactions reference known accounts and tags, writes an encrypted safety
  snapshot, then replaces every table in one transaction. Any failure before the
  write leaves the vault untouched.
- **Everything is revision-checked.** Cascade updates reuse the same
  compare-and-write path, so concurrent browser sessions cannot lose an edit
  while a delete cascades.

## Consequences

- The UI must present destructive actions explicitly and surface `409` bodies
  with their counts; silent deletion is not possible through the API.
- Rule behaviour stays predictable: no hidden retroactive changes, and old
  exports remain importable.
- The archive format is versioned in `contracts/csv/export-format-v1.md`; adding
  optional columns or manifest fields is compatible, changing amount or date
  semantics is not.
