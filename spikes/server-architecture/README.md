# Phase 0 spike — self-hosted server architecture

Throwaway proof-of-concepts for the Phase 0 exit criteria in `PLAN.md`:
encrypted vault storage, vault lifecycle, migrations, failure behaviour,
portable export/import, and private-network HTTPS sessions.

The findings, decisions and measurements are in [REPORT.md](./REPORT.md); the
architecture decisions are recorded in `docs/adr/`.

## Layout

```text
src/crypto/        Argon2id KDF, DEK envelope (AES-256-GCM), record encryption
src/storage/       SQLCipher driver, migrations, SQLCipher and fallback stores
src/vault/         Vault lifecycle: create, unlock, lock, migrate, export, delete
src/portability/   Money, RFC 4180 CSV, password-encrypted archive
src/http/          HTTPS server, sessions, CSRF, auto-lock, lock-all
src/bench/         Measurements used in REPORT.md
tests/             node:test suites (23 tests)
docker/            Multi-arch image and container smoke test
```

## Requirements

- Node.js 22.9 or newer (the code uses native TypeScript type stripping,
  `node:sqlite` for the fallback engine, and `node:test`)
- A C toolchain with OpenSSL headers to build SQLCipher from source
  (`build-essential`, `python3`, `libssl-dev` on Debian; `python3`, `make`,
  `g++`, `openssl-dev` on Alpine)
- Docker with BuildKit for the container checks

## Commands

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # 23 tests: vault, migrations, plaintext, failures, portability, sessions
npm run bench       # KDF, storage throughput, export sizes
```

## Container smoke test

The image runs a four-step lifecycle against a Docker volume so a restart and a
round trip can be verified across containers:

```bash
docker build --platform linux/arm64 -f docker/Dockerfile -t flowly-spike:arm64 .
docker volume create flowly-spike-vault
docker run --rm -v flowly-spike-vault:/vault flowly-spike:arm64 create
docker run --rm -v flowly-spike-vault:/vault flowly-spike:arm64 reopen
docker run --rm -v flowly-spike-vault:/vault flowly-spike:arm64 verify
docker run --rm -v flowly-spike-vault:/vault flowly-spike:arm64 delete
```

Set `FLOWLY_ENGINE=record-encryption` to exercise the fallback engine instead of
SQLCipher. `docker/compose.yaml` wraps the same image for Compose users.

## Scope

This code exists to answer feasibility questions, not to ship. It has no API
versioning, no UI, no authentication beyond the vault passphrase, and it stores
`tagging_rules` as an empty table only to prove the migration path. Phase 1
starts the real workspace in `apps/`, `contracts/` and `packages/`.
