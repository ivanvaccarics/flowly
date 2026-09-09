# Flowly

**Local-first personal finance. Your money, your device, your keys.**

Flowly is a personal finance application for iOS, Android, macOS, Windows, and
the web. Every installation is an independent, encrypted vault — there is no
Flowly account, no cloud database, and no automatic synchronization. Data moves
between your devices only when *you* export and import it.

> **Project status: pre-implementation.**
> The architecture, security model, and delivery plan are complete and reviewed
> (see [PLAN.md](PLAN.md)). No application code has been written yet. The only
> code in the repository is an isolated Enable Banking exploration prototype
> that is **not** production material.

---

## Why Flowly

| Most finance apps | Flowly |
|---|---|
| Require an account and a password | No registration, no identity, no server |
| Store your transactions on their servers | Your data never leaves your device |
| Sync silently in the background | You decide what moves, and when |
| Monetize telemetry and analytics | Zero telemetry, zero trackers, zero ads |
| Break without a network connection | Fully offline by design |
| Own your encryption keys | The key is derived from *your* passphrase |

Flowly is built on one uncompromising rule: **if the vault is locked, there is
nothing readable on disk — not in the database, not in journals, not in caches,
not in logs.**

---

## Features

### Core finance

- **Financial accounts** — checking, savings, credit cards, cash, wallets,
  investment, and custom types, each with its own default currency and optional
  institution and opening balance.
- **Transactions** — signed amounts (inflow/outflow), booking and value dates,
  payee, provider description, pending/booked status, and provenance tracking
  (manual, CSV import, recurring rule, or bank connector).
- **User notes kept separate from imported descriptions** — a future bank
  refresh can never overwrite something you wrote.
- **Tags** — Unicode-normalized, case-insensitive matching with preserved
  display casing and optional colors.
- **Archive-safe deletion** — accounts referenced by transactions cannot be
  silently destroyed; deletion is either an archive or an explicit, confirmed
  cascade.

### Money done correctly

- **No binary floating point, anywhere.** Every amount is a signed integer in
  minor units plus an ISO 4217 currency code.
- **Multi-currency without lies.** Each transaction keeps its original currency;
  totals are computed per currency. Flowly will never merge unlike currencies
  into a single misleading number without an explicit exchange rate and
  valuation date.
- **Versioned currency metadata** — because not every currency has two decimal
  places.

### Analysis

- **Dashboard** — balance by account, net cash flow for a period, income and
  expense totals, spending by tag, budget consumption, and upcoming recurring
  transactions.
- **Advanced search and filters** — date range, account, tag, amount range,
  currency, pending/booked status, source, and free-text over payee,
  description, and notes — with identical semantics on every platform.

### Planning

- **Budgets** — weekly, monthly, quarterly, yearly, or custom periods, with
  optional account and tag scoping and an explicit rollover policy.
- **Recurring transactions** — calendar-aware recurrence (real month and year
  arithmetic, not fixed day counts), with pause/resume and local occurrence
  generation. No cloud scheduler required.

### Security

- **Mandatory local passphrase.** A random 256-bit data-encryption key is
  wrapped by a key derived with Argon2id, using a per-vault salt and
  platform-calibrated parameters.
- **Optional biometric unlock** — Face ID / Touch ID, Android BiometricPrompt,
  Windows Hello, and capability-gated WebAuthn. Biometrics are a *convenience*;
  the passphrase always remains the root of recovery, and the OS store never
  holds your passphrase.
- **Encrypted at rest, everywhere** — SQLCipher-backed SQLite on installed
  clients; authenticated per-record encryption over IndexedDB on the web, with
  decryption confined to a Web Worker.
- **Auto-lock** on inactivity and backgrounding, with decrypted caches and
  sensitive form state cleared on lock.
- **Fail closed** — wrong keys, tampered ciphertext, and corrupt data produce
  actionable errors, never a silently empty vault.
- **No cloud backup leakage** — database files are excluded from OS backups
  unless explicitly approved and encrypted.

### Data portability

- **Transaction CSV** — RFC 4180, UTF-8, ISO 8601 dates, canonical decimal
  amounts, ready for any spreadsheet.
- **Complete portable export** — a versioned archive covering accounts,
  transactions, tags, links, budgets, recurring rules, and preferences, with a
  checksum manifest. This is the supported device-to-device transfer format,
  and a password-encrypted variant is the recommended option.
- **Spreadsheet formula-injection protection** on every exported text field.
- **Staged, transactional import** — detect, parse off the main thread,
  validate, preview with duplicate and error counts, choose merge or replace,
  write atomically, and keep a durable import report.
- **Three-tier deduplication** — stable Flowly UUID, then provider transaction
  identity, then a deterministic fingerprint over normalized account, date,
  amount, currency, and description. No row is ever silently dropped.

### Privacy

- No account registration.
- No analytics or telemetry in the MVP.
- No advertising or tracking SDKs.
- No automatic upload or cloud backup.
- No network dependency for core usage.
- One-action local data deletion that destroys the vault and its wrapped keys.

---

## Architecture

Flowly is a polyglot monorepo with two client implementations sharing one
language-neutral contract layer.

```text
flowly/
  apps/
    web/                  # React + TypeScript + Vite PWA
    native/               # Flutter app: iOS, Android, macOS, Windows
    banking-connector/    # Future server-side TypeScript connector
  contracts/
    schemas/              # Canonical JSON Schemas — the source of truth
    csv/                  # CSV/archive schemas and version history
    fixtures/             # Sanitized cross-client golden fixtures
    expected-results/     # Canonical calculation and dedup outcomes
  packages/               # Generated TS types + test support
  native-packages/        # Generated Dart models + test support
  tooling/                # Scripts, lint, formatting, codegen
  docs/adr/ docs/security/
```

**Why two clients?** Because a browser shell forced onto mobile and desktop is a
worse product than a native one. Flutter gives mature encrypted SQLite,
biometrics, and installers across four installed targets; React gives a
first-class, accessible, installable PWA. The cost — duplicated domain logic in
TypeScript and Dart — is paid deliberately and controlled by contracts, not by
hope:

- Versioned JSON Schemas generate both TypeScript and Dart types.
- One canonical CSV/archive specification.
- Shared golden fixtures with expected results for every business rule.
- Cross-client import/export round-trip tests.
- A single acceptance catalogue executed by both clients, gating releases in CI.

Every client follows the same clean layering — `domain` (no framework, no I/O),
`application` (use cases over repository and platform interfaces),
`infrastructure` (storage, crypto, platform services), and `ui`. The UI never
touches storage directly, and every multi-entity write is atomic.

---

## Platform support

| Target | Runtime | Storage | Unlock |
|---|---|---|---|
| iOS | Flutter | Drift + SQLCipher | Passphrase + Face ID / Touch ID |
| Android | Flutter | Drift + SQLCipher | Passphrase + BiometricPrompt |
| macOS | Flutter | Drift + SQLCipher | Passphrase + Touch ID |
| Windows | Flutter | Drift + SQLCipher | Passphrase + DPAPI / Windows Hello |
| Web / PWA | React + TS | Encrypted IndexedDB records | Passphrase + optional WebAuthn |

Distribution: app stores for mobile, signed direct downloads for desktop, and a
static, offline-capable PWA for the web.

---

## Roadmap

### What exists today

- Apache 2.0 license.
- A complete architecture, security, and delivery plan ([PLAN.md](PLAN.md)).
- An isolated Enable Banking exploration prototype (`enable_banking.py`,
  untracked). It prints tokens and reads a private key from disk — it is a
  research artifact and must be sanitized and moved under `prototypes/` before
  any reuse.

### What comes next

| Phase | Task | Status |
|---|---|---|
| **0 — Feasibility** | `architecture-spike` — prove SQLCipher, secure storage, biometrics, encrypted IndexedDB, PWA offline, and cross-language crypto vectors on all five targets | Not started |
| **1 — Foundation** | `scaffold-monorepo` — repo boundaries, strict TS/Dart analysis, CI, contract codegen | Not started |
| | `define-domain-model` — canonical schemas plus equivalent TS/Dart money, account, transaction, tag, budget, and recurrence models | Not started |
| **2 — Vault** | `implement-vault-crypto` — Argon2id derivation, DEK wrapping, unlock, passphrase change, auto-lock, secure deletion | Not started |
| | `implement-native-storage` — Drift/SQLCipher schema, migrations, backup exclusion | Not started |
| | `implement-web-storage` — authenticated record encryption over IndexedDB in a Web Worker | Not started |
| **3 — Core finance** | `implement-core-finance` — accounts, transactions, tags, notes, adaptive navigation, accessible forms | Not started |
| | `implement-csv-transfer` — export format v1, portable archive, preview, dedup, merge/replace, rollback | Not started |
| **4 — Analysis** | `implement-dashboard-search` — summaries, filters, text search, performance indexes | Not started |
| | `implement-budgets-recurring` — budget periods and consumption, calendar-safe recurrence | Not started |
| **5 — Hardening** | `integrate-platform-shells` — permissions, deep links, installers, signing, PWA install and update UX | Not started |
| | `harden-and-validate` — accessibility, performance, migration, recovery, threat model, SBOM, independent crypto review | Not started |
| | `build-release-pipelines` — reproducible builds, separated signing, verified artifacts | Not started |
| **6 — Banking** | `design-banking-connector` / `implement-banking-connector` — a **server-side** Enable Banking connector, post-MVP | Not started |

Phase dependencies and parallelization rules are documented in
[PLAN.md](PLAN.md).

### Future: bank connectivity, done safely

Enable Banking application private keys and JWT signing will **never** ship
inside a distributed client. When bank import arrives, it will be a separate
connector service that holds credentials in a managed secret store, issues
short-lived signed JWTs, normalizes provider data, and delivers a batch once to
an unlocked client. It is an *ingestion channel*, not a sync service, and not a
canonical database. Your local vault always remains the source of truth.

---

## Definition of done for the MVP

Flowly 1.0 ships only when all of the following hold:

- A vault can be created and unlocked on every target.
- Biometric unlock never removes passphrase recovery.
- Accounts, transactions, notes, tags, budgets, and recurring rules work fully
  offline.
- Multi-currency values carry no floating-point error and no misleading
  aggregation.
- Dashboards and filters return equivalent results on every platform.
- Full exports round-trip between every platform with identical IDs, amounts,
  dates, relationships, and notes.
- Invalid imports fail visibly and atomically.
- No shipped artifact contains provider keys, test secrets, or real fixture
  data.
- A locked vault leaves no plaintext in storage, journals, caches, logs, or
  crash reports.
- Accessibility (WCAG 2.2 AA on web), security, migration, recovery, and
  release checks all pass.

---

## Explicitly out of scope

Flowly says no on purpose. Not in the MVP, and in most cases not ever:

- A Flowly cloud account or username/password login
- Automatic cross-device synchronization
- Shared household vaults
- Server-side canonical transaction storage
- Automatic exchange-rate retrieval
- Investment portfolio pricing
- Receipt and image attachments
- Payment initiation
- Background server scheduling for recurring transactions

---

## Important warnings

- **There is no passphrase recovery.** There is no account, no server, and no
  key escrow. If you lose your passphrase and every unlocked device, your data
  is gone permanently. Recovery is possible only from an export whose password
  you know.
- **There is no synchronization.** Two devices are two independent vaults.
- **Plain CSV exports are not encrypted.** Prefer the password-protected
  portable archive for transfers.
- **Browser storage can be evicted.** The PWA requests persistent storage and
  will remind you to export regularly.

---

## Contributing

The project is in the architecture phase. Before writing feature code, Phase 0
(`architecture-spike`) must prove the encrypted-storage, secure-key, and
biometric stack on every target — if a library fails there, the wrapper choice
changes before any product work begins.

Repository conventions live in [AGENTS.md](AGENTS.md):

- One commit per logically complete change, in Conventional Commits format.
- Review `git diff` and run the relevant tests and checks before committing.
- Never commit secrets, real financial data, or temporary files.
- Keep [PLAN.md](PLAN.md) and this README consistent with the actual behavior of
  the code in the same commit as the change.

Security-relevant work additionally requires: parameterized SQL only, runtime
schema validation at every trust boundary, structured log redaction, and no
hand-rolled cryptographic primitives.

---

## License

[Apache License 2.0](LICENSE)