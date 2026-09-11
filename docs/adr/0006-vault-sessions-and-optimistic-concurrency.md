# ADR 0006 — Vault sessions and optimistic concurrency

Status: Accepted (Phase 2)

## Context

Phase 2 turns the locked shell into a real vault: one encrypted store, several
browser sessions on a private network, and writes that must never overwrite a
newer edit silently. It also has to build a native SQLCipher addon reliably on
developer machines and inside containers.

## Decision

- **Revision on every mutable record.** Accounts, transactions, tags, tagging
  rules and recurring rules carry an integer `revision` starting at `1` (the
  recurring table was removed later, see `docs/adr/0015`). The revision lives in
  its own column and is authoritative on read. The
  API requires the revision the client read on every update and delete; a
  mismatch returns `409 revision_conflict` with the expected and the actual
  revision.
- **Compare-and-write inside one transaction.** The store reads the current
  revision, compares it, and writes inside a single `BEGIN IMMEDIATE`
  transaction, so two concurrent browser sessions cannot interleave between the
  check and the write.
- **Server-side sessions.** A random opaque session id lives in an
  `HttpOnly; SameSite=Strict; Path=/` cookie, marked `Secure` when the request
  arrives over HTTPS through a trusted proxy. Mutating requests must also send
  the per-session CSRF token in `x-flowly-csrf`, and a present `Origin` header
  must match the configured browser origin.
- **Lifetimes.** Sessions expire on a sliding idle timeout and an absolute cap.
  Unlock attempts are rate-limited per client address. When no session remains
  active, the vault locks itself after the configured auto-lock window; key
  material is zeroized at that point.
- **Explicit status codes.** `401` for a missing or expired session, `403` for a
  rejected origin or CSRF token, `423` when a valid session meets a locked
  vault, `429` when unlock attempts are throttled, `404` for a missing vault or
  record, and `409` for a revision or uniqueness conflict.
- **Native dependency toolchain.** `node-gyp` is pinned to `^11.5.0` at the
  workspace root because `node-gyp` 13 pulls undici 8, which requires Node
  22.12 or newer. The container installs `python3`, `make`, `g++`,
  `linux-headers` and `openssl-dev` to compile SQLCipher, and ships
  `libstdc++` and `libcrypto3` at runtime.
- **Fallback loading.** The `node:sqlite` fallback engine is imported lazily and
  reports a clear error when Node's `--experimental-sqlite` flag is missing;
  the server test script sets `NODE_OPTIONS` so both engines stay covered.

## Consequences

- A client that ignores revisions cannot write; the web UI must surface
  conflicts and reload the record instead of retrying blindly.
- Conflict handling stays correct across concurrent browser sessions without
  locking the whole vault.
- Developers on Node 22.9 see Vite's version warning and can still run
  everything; Node 22.12 or newer is the supported floor.
- The Phase 2 image is still a development image. Static web serving, HTTPS
  termination and release hardening remain Phase 5 work.
