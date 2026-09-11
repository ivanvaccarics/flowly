# ADR 0002 — Passphrase-derived key hierarchy and vault envelope

Status: Accepted (Phase 0)

## Context

The vault is unlocked by a passphrase with no recovery path, so the derivation
must be slow and memory-hard, and a passphrase change must not require
re-encrypting the database.

## Decision

- Derive a key-encryption key with **Argon2id** (`@node-rs/argon2`) using a
  random 16-byte salt stored in the vault header; default parameters
  `memoryCost = 19456 KiB (19 MiB), timeCost = 2, parallelism = 1, outputLen = 32`.
  Parameters are stored with the vault so they can be raised later.
- Generate a random 32-byte **data-encryption key (DEK)** and wrap it with
  **AES-256-GCM**, binding the ciphertext to the vault identifier through
  additional authenticated data.
- Derive purpose-specific subkeys from the DEK with **HKDF-SHA256** rather than
  reusing the DEK directly.
- Zero key material from memory when the vault locks.

## Consequences

- A passphrase change only re-wraps the DEK; data stays untouched.
- Wrong passphrases and tampered headers both surface as an explicit
  authentication failure (measured: 22.9 ms per unlock with the default
  parameters).
- The 19 MiB/t=2 default is deliberately conservative for low-power self-hosting
  hardware; the parameter set must be re-measured on the weakest supported host
  before it is frozen.
