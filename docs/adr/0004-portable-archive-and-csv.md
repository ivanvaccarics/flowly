# ADR 0004 — CSV export and password-encrypted portable archive

Status: Accepted (Phase 0, format owned by Phase 3)

## Context

Users move data between independent vaults by explicit export and import. A
plain transaction CSV is useful for spreadsheets but dangerous to treat as a
backup, while a complete vault transfer must be encrypted and verifiable.

## Decision

- Keep a plain **transaction CSV** as an interoperability format: RFC 4180
  quoting, ISO 8601 dates, canonical decimal amounts, deterministic column
  names, and formula-injection protection that escapes `=`, `+`, `@` and
  non-numeric `-` cells while leaving negative amounts untouched.
- Transfer complete vaults with a **password-encrypted archive**: a gzipped tar
  of CSV/JSON entries plus a manifest of SHA-256 checksums, encrypted with
  AES-256-GCM under an Argon2id-derived key, with a magic header and format
  version.
- Fail loudly on wrong passwords, truncation, bad magic bytes and checksum
  mismatches; never partially import.

## Consequences

- A complete archive is self-describing and tamper-evident, and the same
  container can carry the tagging rules added in Phase 3.
- The manifest checksums catch carriage corruption inside a correctly decrypted
  archive, which the AEAD tag alone would not.
- This is a proof of concept: Phase 3 owns the versioned format contract,
  streaming writes, size limits and the exact import preview semantics.
