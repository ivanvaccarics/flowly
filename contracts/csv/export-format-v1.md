# Export format version 1

Three export workflows share this document: the plain **transaction CSV** for
spreadsheets, the plain **tables ZIP** that hands every table back for use
outside Flowly, and the password-encrypted **complete portable archive** that
moves a whole vault between independent deployments.

## Transaction CSV

- UTF-8, RFC 4180 quoting, `\r\n` line endings, deterministic column order:

  `id,account_id,booking_date,value_date,amount,currency,payee,description,user_note,status,source,tags,transfer`

- `amount` is a canonical decimal string in the transaction currency; it is
  parsed back into signed minor units with strict currency-aware validation.
- `booking_date` and `value_date` are ISO 8601 calendar dates.
- `tags` joins the tag **names** with `|`, so a CSV stays readable. Matching on
  import is Unicode-normalized and case-insensitive; unknown tag names are
  created.
- Formula-injection protection prefixes `'` to cells starting with `=`, `+`,
  `@`, tab or carriage return, and to a `-` that is not a plain number. Plain
  negative amounts stay untouched so spreadsheets keep working.
- Duplicate detection order: Flowly UUID, then provider plus provider
  transaction id, then the deterministic import fingerprint defined in
  `contracts/README.md`.
- `transfer` is `true` on a movement between the user's own accounts, `false`
  when the user said it is not one, and empty while nobody has decided. A file
  written before the column existed imports with every row undecided, and a
  value that is neither of the two words fails the row instead of guessing.
- Import is additive and reports created, skipped-duplicate and invalid rows.
  It never replaces a vault.

## Complete portable archive

The archive is the supported way to move a complete vault. Layout:

1. A gzipped tar containing `manifest.json`, `accounts.csv`, `transactions.csv`,
   `tags.csv` and `tagging_rules.json`.
2. `manifest.json` lists every entry with its byte length and SHA-256 digest,
   plus `formatVersion`, `createdAt` and the Flowly vault id.
3. The tar is encrypted with AES-256-GCM under a key derived from the archive
   password with Argon2id (parameters stored in the container header, same
   defaults as the vault).
4. Container framing: magic `FLOWLYAR`, a 4-byte big-endian header length, the
   JSON header, the 12-byte IV, the 16-byte GCM tag, then the ciphertext. The
   magic and header are authenticated as additional data.

Rules for reading:

- A wrong password, a truncated container, bad magic bytes, a broken checksum
  or an unknown format version fails loudly; nothing is imported.
- The importer always replaces the destination vault, requires an explicit
  confirmation, saves an encrypted safety snapshot first, writes inside one
  transaction and rolls back on any failure.
- Tagging rules are part of version 1 because they ship in the Server MVP.
- Archives written before `docs/adr/0015` still carry `recurring_rules.csv`
  (usually empty). Import ignores the file instead of rejecting the archive.

## Tables ZIP (`flowly-tables-v1`)

`GET /api/export/tables.zip` returns one folder named
`flowly-export-<yyyy-mm-dd>/` containing `README.txt`, `manifest.json`,
`accounts.csv`, `transactions.csv`, `tags.csv` and `tagging_rules.csv`.

- `accounts.csv`, `tags.csv` and `transactions.csv` use the column order
  documented above, so the ledger can be merged back through the CSV import.
- `tagging_rules.csv` carries `id, name, enabled, kind, combinator, conditions,
  outgoing, incoming, window_days, tag_names, created_at, updated_at`.
  `conditions`, `outgoing` and `incoming` are the JSON condition sets in a single
  cell; a `match` rule fills `combinator`, `conditions` and `tag_names`, while a
  `transfer-pair` rule fills `outgoing`, `incoming` and `window_days`. (The
  archive's `tagging_rules.json` is the lossless copy; this file is for reading.)
- `manifest.json` holds `format`, `exportedAt`, the vault id, `encrypted: false`,
  per-table row counts and a SHA-256 for every file.
- The export is plain text and is **not** a restore format; the encrypted archive
  above is the supported way to restore or move a vault.

## Versioning

Adding an optional column or an optional manifest field is not a breaking
change. Removing or renaming a column, or changing amount/date semantics,
requires a new format version plus migration notes for both clients.
