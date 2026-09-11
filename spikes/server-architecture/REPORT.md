# Phase 0 — Server architecture and security feasibility report

Date: 2026-09-11

Host used for the spike: macOS `darwin/arm64`, Node `v22.9.0`, Docker `29.4.2`
(Linux `aarch64` engine, `linux/amd64` images verified through Docker Desktop
emulation).

Every number below was measured by the code in this directory; nothing is
estimated. Reproduction commands are at the end of this file.

## 1. Decisions taken

| Area | Decision | Evidence |
|---|---|---|
| Encrypted vault storage | **SQLCipher 4.14.0** through `@journeyapps/sqlcipher@6.0.0` (BSD-3-Clause, published 2026-04-29) | Compiles from source on macOS and inside Alpine; encrypted file, no SQLite magic header, no plaintext, wrong key rejected with `SQLITE_NOTADB` |
| Fallback storage | `node:sqlite` + **AES-256-GCM per record** with HKDF-SHA256 subkeys | Same 23-test suite passes on this engine; keeps metadata visible, documented as the trade-off |
| Rejected driver | `better-sqlite3@13.0.3` | Its `darwin-arm64` prebuild **segfaults** on Node 22.9.0 (`new Database(":memory:")`, exit code 139), reproduced outside the sandbox; `npm rebuild --build-from-source` produced no compiled binary |
| Passphrase KDF | **Argon2id** through `@node-rs/argon2@2.2.1` (MIT), default `19 MiB / t=2 / p=1 / 32-byte output` | 22.9 ms per derive+unwrap; 46 MiB/t=1 → 28.3 ms; 64 MiB/t=3 → 123.6 ms |
| Key hierarchy | Passphrase → Argon2id → KEK (32 B) → wraps a random 32-byte DEK with **AES-256-GCM**, AAD bound to the vault id; purpose subkeys via **HKDF-SHA256** | `vault header never stores the DEK or the passphrase in clear` test; tampered wrapped key is rejected |
| Local transport and sessions | `node:https` same-origin API, `HttpOnly; SameSite=Strict; Secure` cookie, per-session CSRF token, Origin allow-list, unlock rate limiting, idle + absolute session expiry, auto-lock, lock-current/lock-all | `tests/session.test.ts` (6 tests) |
| Portability | RFC 4180 transaction CSV with formula-injection protection that keeps plain negative numbers intact; password-encrypted archive (tar.gz inside AES-256-GCM, Argon2id key, SHA-256 manifest) | `tests/portability.test.ts` (5 tests) |

## 2. Measurements (2 000 transactions, `EUR`)

| Metric | SQLCipher | Record-encryption fallback |
|---|---|---|
| Insert 2 000 transactions (one transaction) | 77.5 ms → ~25 800 tx/s | 53.9 ms → ~37 100 tx/s |
| Read 2 000 transactions | 6.1 ms | 19.2 ms |
| Export CSV (244.8 KiB) | 11.5 ms | 19.3 ms |
| Export encrypted archive (26.0 KiB) | 40.7 ms | 33.5 ms |
| Vault size on disk (incl. WAL) | 1 166.6 KiB | 1 259.2 KiB |

KDF derive + unwrap, averaged over 3 runs:

| Parameters | Time |
|---|---|
| 19 MiB, t=2 (OWASP minimum, chosen default) | 22.9 ms |
| 46 MiB, t=1 | 28.3 ms |
| 64 MiB, t=3 | 123.6 ms |

Docker images built from `docker/Dockerfile` (`node:22.9-alpine`, runtime stage
only carries production dependencies):

| Platform | Image size | Vault lifecycle timings |
|---|---|---|
| `linux/arm64` | 194.0 MB uncompressed | create 46 ms, reopen 72 ms |
| `linux/amd64` (emulated) | 197.3 MB uncompressed | create 140 ms, reopen 178 ms |

Inside the image the application layer is small: SQLCipher addon 14.8 MB,
`@node-rs/argon2` 1.4 MB, `tar` 2.9 MB, application source 160 KB; the rest is
the Node.js base image.

## 3. Exit criteria

> Every supported Docker platform can create, lock, reopen, migrate, export and
> delete an encrypted vault without plaintext artifacts.

Verified with a persistent volume and one container per step, on both
`linux/arm64` and `linux/amd64`:

```text
{"mode":"create","engine":"sqlcipher","vaultId":"569a1100-…","plaintextScan":{"files":2,"leaks":[]},"ms":46}
{"mode":"reopen","engine":"sqlcipher","vaultId":"569a1100-…","transactions":1,"csv":{"rows":1},"archive":{"bytes":1053,"files":["accounts.csv","transactions.csv","tags.csv","tagging_rules.json"]},"schemaVersion":2,"ms":72}
{"mode":"verify","engine":"sqlcipher","imported":{"accounts":1,"transactions":1},"ms":92}
{"mode":"delete","engine":"sqlcipher","exists":false}
```

Additional evidence:

- The plaintext scan walks every vault file and fails the run if any of the
  sensitive markers appears: 2 files scanned, 0 leaks, SQLCipher header absent.
- Migrations apply in order (v1 schema, v2 tagging-rules table) and a crash
  injected before `COMMIT` leaves the previous schema and data intact, which is
  the interrupted-write case from the plan.
- A separate process reopens the vault created by another process, proving no
  in-memory state is required across restarts.
- Corrupted, truncated and wrong-key vaults all fail closed; none of them is
  silently reported as an empty vault.

Not yet covered: a native `linux/amd64` host (the amd64 run used Docker Desktop
emulation on Apple Silicon) and Docker Desktop on Windows.

## 4. Open items for Phase 1

1. Keep SQLCipher behind an adapter interface (already done here) because
   `@journeyapps/sqlcipher` is a single-maintainer fork; the record-encryption
   engine stays as the portable fallback if the native build ever breaks.
2. Re-measure Argon2id parameters on the weakest supported host before freezing
   the default; 64 MiB/t=3 costs 123 ms on this machine and may be heavy on a
   Raspberry Pi class device.
3. `node:sqlite` is still experimental and needs `--experimental-sqlite`; treat
   it as a fallback, not the primary engine, until the API is stable.
4. Pin the Node base image by digest, add a healthcheck and build both
   architectures in CI (`docker buildx build --platform linux/amd64,linux/arm64`).
5. The archive format here is a proof of concept: Phase 3 owns the versioned
   format, streaming writes and the checksum manifest contract.
6. Replace the spike's JSON vault header with the versioned schema in
   `contracts/` and add a real migration test from every released format.

## 5. Reproduction

```bash
cd spikes/server-architecture
npm install
npm run typecheck
npm test          # 23 tests, no network required
npm run bench     # KDF, storage and portability measurements

docker build --platform linux/arm64 -f docker/Dockerfile -t flowly-spike:arm64 .
docker volume create flowly-spike-vault
docker run --rm -v flowly-spike-vault:/vault flowly-spike:arm64 create
docker run --rm -v flowly-spike-vault:/vault flowly-spike:arm64 reopen
docker run --rm -v flowly-spike-vault:/vault flowly-spike:arm64 verify
docker run --rm -v flowly-spike-vault:/vault flowly-spike:arm64 delete
```

Note: tests that bind a local socket (the session suite) need permission to
listen on `127.0.0.1` when they run inside a restricted sandbox.
