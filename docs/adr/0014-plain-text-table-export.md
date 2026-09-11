# ADR 0014 — Export every table as plain CSV for data liberation

Status: Accepted (2026-09-11)

## Context

Flowly could hand back a single transaction CSV and a complete portable archive.
The archive restores a vault, but it is encrypted with an archive password and
its layout belongs to Flowly: someone who decides to stop using the product has
no one-step way to leave with everything in a form any other tool can read.

`docs/PLAN.md` §10.3 already requires plain-text exports to warn the user, to
never leave unmanaged plaintext files behind and to carry no cryptographic
metadata.

## Decision

- Add a third export: `GET /api/export/tables.zip`, one CSV per table
  (`accounts`, `transactions`, `tags`, `tagging_rules`, `recurring_rules`), plus
  `manifest.json` (row counts and a SHA-256 per file) and `README.txt`.
- Build the archive in memory and hand it to the browser; nothing is written to
  the server's disk. The transaction CSV keeps the documented export format, so
  a ledger can still be merged back through the existing CSV import.
- The ZIP is **export-only**. The encrypted `.flowly` archive stays the backup
  and device-to-device format; the ZIP is explicitly not a restore path and says
  so in its own README.
- The interface asks for confirmation before downloading, because this is the
  whole vault in the clear.
- Write the ZIP container in the repository (`portability/zip.ts`) instead of
  taking a dependency: it is ~120 lines, needs only `node:zlib`, and keeps the
  dependency and license surface unchanged. There is no ZIP64 support; a vault
  large enough to need it fails loudly rather than producing a broken archive.

## Consequences

- Leaving Flowly with your data is one click, and the result reads in any
  spreadsheet or script.
- Plaintext leaves the server, so `docs/security/data-loss.md`,
  `threat-model.md` and `support-matrix.md` now name this export next to the
  plain transaction CSV.
- Tagging rules and recurring rules are nested structures: their CSVs keep the
  condition array in one JSON cell rather than flattening it into columns.
