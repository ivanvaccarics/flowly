# ADR 0001 — Encrypted vault storage on the self-hosted server

Status: Accepted (Phase 0)

## Context

The server owns one vault on hardware the user controls. PLAN.md requires that a
locked vault leaves nothing readable on disk, that tampering fails closed, and
that migrations, exports and rollbacks stay atomic. Phase 0 had to choose how
SQLite data is encrypted at rest and prove it works on the supported Docker
platforms.

## Decision

- Use **SQLCipher 4** (`@journeyapps/sqlcipher`) as the primary engine, opened
  with a 32-byte raw key derived from the vault's data-encryption key. The whole
  database file, including WAL and indices, is encrypted; `cipher_memory_security`
  is enabled.
- Keep the engine behind a `VaultStore` interface and maintain a second engine,
  **`node:sqlite` + AES-256-GCM per record** with HKDF-SHA256 subkeys, as the
  fallback when the native SQLCipher build is unavailable.
- Reject `better-sqlite3`, whose prebuilt binary crashed on Node 22.9.0 in this
  environment.

## Consequences

- Vault files carry no SQLite magic header and no plaintext; a wrong key raises
  `SQLITE_NOTADB` instead of returning an empty database.
- The container image needs a C toolchain at build time and `libcrypto3` +
  `libstdc++` at runtime; both were verified inside Alpine.
- The fallback keeps the SQLite structure, record ids and dates visible, and is
  roughly twice as slow on reads. It is a portability safety net, not an equal
  alternative.
- SQLCipher is a single-maintainer fork of `node-sqlite3`, so the adapter
  boundary must stay stable and the fallback must keep passing the same
  contract suite.
