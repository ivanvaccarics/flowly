# Export format version 1

Two export workflows share this document: the plain **transaction CSV** for
spreadsheets, and the password-encrypted **complete portable archive** that
moves a whole vault between independent deployments.

## Transaction CSV

- UTF-8, RFC 4180 quoting, `\r\n` line endings, deterministic column order:

  `id,account_id,booking_date,value_date,amount,currency,payee,description,user_note,status,source,tags`

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
- Import is additive and reports created, skipped-duplicate and invalid rows.
  It never replaces a vault.

## Complete portable archive

The archive is the supported way to move a complete vault. Layout:

1. A gzipped tar containing `manifest.json`, `accounts.csv`, `transactions.csv`,
   `tags.csv`, `tagging_rules.json`, `budgets.csv` and `recurring_rules.csv`.
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
- Tagging rules are part of version 1 because they ship in the Server MVP;
  recurring rules join through a later version bump in Phase 7.

## Versioning

Adding an optional column or an optional manifest field is not a breaking
change. Removing or renaming a column, or changing amount/date semantics,
requires a new format version plus migration notes for both clients.
