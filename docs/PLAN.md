# Flowly - Architecture, Security, Requirements, and Implementation Plan

> Companion documents: [RUNNING.md](./RUNNING.md) explains how to run the app,
> self-host it and work on later iterations; [adr/](./adr/) records the decisions
> behind each phase; [../contracts/](../contracts/) holds the canonical schemas
> and golden vectors. All paths in this document are relative to the repository
> root.

## 1. Purpose

Flowly is a local-first personal finance application delivered first as a
self-hosted server and web UI. A later phase adds one installed client, a
**desktop application** for macOS and Windows. Flowly is desktop-only: there is
no mobile application and no mobile platform in this plan.

A server deployment owns one vault shared by its browser sessions; browsers are
clients of that vault and do not persist independent copies. Later installed
applications are independent sources of truth. There is no automatic
synchronization between a server deployment and installed applications. Users
move data between independent vaults through a versioned export/import workflow.

The first release is the **Flowly Server MVP**. It includes:

- Financial accounts such as bank accounts, cards, cash, and wallets
- Manual transaction management
- Transaction tags and user-authored notes
- Manual tagging rules that apply tags automatically to new and imported
  transactions
- Multi-currency support
- Search and advanced filters
- Dashboard and summaries
- Full data export and import
- Server-side passphrase protection and secure browser sessions

The desktop application, its encrypted local storage and optional biometric
unlock are post-Server-MVP deliverables in Phases 8-10.

Username/password accounts, Flowly-operated cloud services, and cross-device
synchronization are explicitly out of scope.

## 2. Current Repository Assessment

The repository holds the completed Phase 0 feasibility work and the Phase 1
foundation:

- `apps/server` is the TypeScript service: domain models and invariants,
  application interfaces, and a Fastify JSON API. `apps/web` is the React/Vite
  browser client and `packages/web-contracts` holds generated types plus runtime
  validators. All three are pnpm workspace members.
- `contracts/` is the canonical, language-neutral source of truth with JSON
  Schema 2020-12 definitions, valid fixtures and golden expected results.
  Regenerating them is part of the gate, so generated code cannot drift.
- `docs/adr/` records the binding Phase 0 decisions on storage, key hierarchy,
  sessions and portability.
- `spikes/server-architecture/` holds the completed Phase 0 proof-of-concepts:
  encrypted vault storage, vault lifecycle, migrations, failure behaviour,
  portability and HTTPS sessions, with a measured report and multi-architecture
  container checks. It is retained as reference evidence and is excluded from
  the workspace, lint and formatting surface.
- CI (`.github/workflows/ci.yml`) verifies formatting, lint, types, tests,
  contract freshness, builds, and both container architectures.
- The vault is implemented and encrypted at rest, and the browser UI covers the
  unlock flow, accounts, transactions, tags, tagging rules, import/export and
  the Enable Banking connection. It is aligned with the Sovereign Ledger
  mockups (`docs/adr/0012`).
- `apps/server/src/banking/` is the Enable Banking connector: signed JWT
  requests, normalization, the sync engine and the bank tables
  (`docs/adr/0016`).
- Local `data/`, `secrets/` and `node_modules/` paths are ignored.
- Local SQLite and JSON files exist under the ignored `data/` directory. Their
  financial contents are not required for architecture planning and should be
  treated as sensitive local data.

The prototype kept under the ignored `data_bank/` directory is now superseded by
`apps/server/src/banking/`; it stays only as a local reference and is not part of
the build, the tests or the release.

## 3. Confirmed Product Decisions

| Decision | Selected direction |
|---|---|
| First release | Self-hosted Server MVP at the end of Phase 5 |
| Platform scope | Desktop only: the self-hosted server with its browser UI, plus one desktop application. No mobile client |
| Desktop application targets | macOS and Windows |
| Browser target | React web UI served by a self-hosted service on a private network |
| Server distribution | Docker Compose on Linux amd64/arm64 and Docker Desktop on macOS/Windows |
| Desktop distribution | Direct signed downloads for macOS and Windows; no app store |
| Account meaning | Financial account, not a Flowly user identity |
| Unlock | Server passphrase and secure session; desktop passphrase plus optional biometrics (Touch ID, Windows Hello) from Phase 8 |
| Device relationship | The desktop application owns an independent vault; browser sessions share their server vault |
| Data transfer | Explicit export/import performed by the user |
| Web ownership | Single owner, one vault, multiple concurrent browser sessions |
| Web deployment | Persistent Docker volume and private-network HTTPS; no direct Internet exposure |
| Access boundary | Private LAN or user-managed VPN only |
| Server storage engine | SQLCipher 4 through `@journeyapps/sqlcipher`, with `node:sqlite` plus AES-256-GCM record encryption as the documented fallback |
| Toolchain | pnpm workspace on Node.js 22.12 or newer; TypeScript 6.0.3 while `typescript-eslint` does not support TypeScript 7 |
| Server HTTP layer | Fastify 5 serving a same-origin JSON API; the domain imports no HTTP or storage API |
| Contract tooling | JSON Schema 2020-12 as the source of truth, generated TypeScript types, and Ajv runtime validation that always accompanies them |
| Delivery order | Release the server, then Enable Banking for Server, then the desktop application |
| Bank integration | Enable Banking, implemented inside the server (`docs/adr/0016`): credentials live in the encrypted vault, raw provider JSON is stored per account, and the vault keeps the canonical ledger |
| Additional MVP scope | Dashboard, advanced search, multi-currency, manual tagging rules |
| Auto-tagging rules | Server MVP, Phase 3: one AND/OR condition group over note, description, payee, amount, or account, adding one or more tags; tags are only added, provenance is not tracked, and editing a transaction does not re-run rules |
| Next feature after the MVP | Desktop application foundation in Phase 8; Enable Banking for Server (Phase 6) is delivered |

## 4. Architecture Options Considered

| Option | Advantages | Disadvantages | Decision |
|---|---|---|---|
| Flutter for every client | One Dart UI codebase; mature desktop and web targets | Does not provide the desired central self-hosted vault and multi-PC browser access without adding a server anyway | Not selected |
| Tauri 2 for the desktop client plus the web UI | Small binaries; Rust security boundary; high code sharing | Adds a second toolchain and a Rust surface beside Flutter | Reserve as a future simplification option |
| React UI + self-hosted TypeScript service + a Flutter desktop client | One server vault is shared safely by multiple PCs; browser storage is not a source of truth; Flutter desktop keeps mature local storage and biometrics | Requires private-network HTTPS, server sessions, concurrency handling, desktop packaging, and an available host | **Recommended** |
| Encrypted browser PWA + self-hosted file storage | The host never handles plaintext domain data | Each browser still owns a divergent vault; conflict resolution, querying, and multi-PC consistency become substantially more complex | Rejected |
| Fully separate applications per platform | Maximum platform-specific control | Excessive duplication across the server, the browser UI and the desktop client | Rejected |

### Recommendation

Use a polyglot monorepo with two application implementations:

- **Self-hosted web:** a React and TypeScript frontend plus a TypeScript service
  deployed together with Docker Compose. The service owns the encrypted vault,
  domain operations, sessions, and import/export. Browsers are presentation
  clients and persist no financial records.
- **Desktop application:** one Flutter/Dart codebase compiled for macOS and
  Windows.
- **Bank connector:** a module inside the self-hosted TypeScript service
  (`apps/server/src/banking/`) that owns Enable Banking credentials and API
  sessions, keeps them inside the encrypted vault, and serves both the web UI
  and, from Phase 11, the desktop application (`docs/adr/0016`).

Delivery is intentionally sequential: implement and release the TypeScript
server first, then use its stable contracts and golden fixtures to implement
the desktop client. Do not scaffold or implement the desktop client during
Server MVP phases 0-5.

This hybrid approach is preferable when a single self-hosted private-network vault,
encrypted SQLite, desktop platform maturity, biometric integration, and
consistent installed-app behavior are more important than maximum source-code
sharing. It also keeps the desktop client a real installed application instead
of a browser shell.

The trade-off must be accepted explicitly: the TypeScript service and the
desktop client will have separate application/domain implementations, while
React remains a thin client of the service. TypeScript and Dart share
specifications rather than runtime libraries. Product parity is enforced through:

- Versioned JSON Schema contracts
- Generated TypeScript and Dart data types where practical
- One canonical CSV/archive specification
- Shared golden fixtures and expected calculation results
- Cross-client import/export round-trip tests
- One acceptance-test catalogue executed by both application implementations

Do not attempt to share business logic through WebViews, embedded JavaScript, or
Flutter platform channels. That would add runtime complexity without removing
the need for platform-specific testing.

## 5. Proposed Repository Structure

```text
flowly/
  apps/
    server/                      # Self-hosted TypeScript API, domain and vault
      src/
        api/                     # Fastify routes and contract validation
        application/             # Repository and platform-service interfaces
        banking/                 # Enable Banking: JWT, client, normalize, sync
        crypto/                  # Argon2id KDF, DEK envelope, record encryption
        domain/                  # Money, accounts, transactions, tags, rules, banking
        session/                 # Browser sessions and unlock rate limiting
        storage/                 # SQLCipher adapter, migrations, repositories
        vault/                   # Vault lifecycle service
      tests/                     # Vitest suites, including golden vectors
      Dockerfile                 # Multi-arch server image
    web/                         # React/Vite browser UI; no vault storage
      src/
        api/                     # Same-origin API client
        components/              # Locked-vault shell and future screens
    desktop/                     # Flutter desktop app for macOS and Windows
  contracts/
    schemas/                     # Canonical JSON Schema definitions
    fixtures/                    # Valid instances every client must accept
    expected-results/            # Golden vectors: money, tagging rules, dedup
  packages/
    web-contracts/               # Generated TS types plus Ajv runtime validators
    web-test-support/            # React/TS conformance helpers
  desktop-packages/
    flowly_contracts/            # Generated Dart models and validators
    flowly_test_support/         # Flutter/Dart conformance helpers
  tooling/
    scripts/                     # Workspace checks such as the secret scan
  docs/
    adr/                         # Phase 0 and later decision records
    security/
  deployment/
    self-hosted/                 # Docker Compose, HTTPS proxy, multi-arch packaging
  spikes/
    server-architecture/         # Phase 0 proof-of-concepts, retained as evidence
  .github/workflows/             # CI: verify + multi-arch container build
```

Use `pnpm` workspaces for the React client and the generated TypeScript
packages, on Node.js 22.12 or newer. Use the Flutter SDK and Dart
packages for the desktop client. Root scripts provide one command surface:
`pnpm verify` (format, lint, secret scan, types, tests), `pnpm build`,
`pnpm dev`, and `pnpm contracts:generate` / `pnpm contracts:check`. Add a Flutter
monorepo tool such as Melos only if multiple Dart packages make it worthwhile.

## 6. Architectural Boundaries

### 6.1 Shared contracts

`contracts/` is the language-neutral source of truth for:

- Persisted entity shapes
- Enumerations and identifiers
- CSV/archive versions
- Validation examples
- Import deduplication fixtures
- Money, recurrence, and dashboard expected results
- Cryptographic envelope metadata and known-answer vectors

Breaking contract changes require a new schema/export version and migrations in
the server and the desktop application. Generated types do not replace runtime
validation or domain invariants.

### 6.2 Domain and application layers

Implement the same clean boundaries independently in the TypeScript service and
the desktop application:

- The server domain imports no React, HTTP framework, SQL, filesystem, or
  network APIs.
- The desktop domain imports no Flutter widgets, SQL, platform channels, or
  network APIs.
- Application services depend on repositories and platform-service interfaces.
- React and Flutter UI code never query storage directly.

The server and desktop implementations own the same behavior:

- Financial account lifecycle
- Money and currency invariants
- Transaction validation
- Tags
- Tagging rule evaluation
- Recurrence rules and occurrence generation
- Dashboard calculations
- Import deduplication policies

Money must never use binary floating-point values. Store and calculate monetary
values as signed integer minor units plus ISO 4217 currency codes. Currency
minor-unit metadata must be versioned because not every currency has two decimal
places.

### 6.3 Application interfaces

Use-case services coordinate domain rules through interfaces:

- `VaultService`
- `AccountRepository`
- `TransactionRepository`
- `TagRepository`
- `TaggingRuleRepository`
- `TaggingRuleService`
- `ImportExportService`
- `Clock`
- `IdGenerator`
- `SecureKeyStore`
- `FilePicker`
- `BiometricUnlock`

Every write spanning multiple entities must run in an atomic storage
transaction.

Tagging rule evaluation is deterministic and runs inside the same atomic write
as the transaction creation or import batch, so applied tags never diverge from
the persisted transactions.

Mutable records exposed by the server API include an opaque revision. Updates
use optimistic concurrency: a stale revision returns an explicit conflict and
never silently overwrites a newer edit from another browser session.

### 6.4 Infrastructure adapters

- Server adapters use HTTP, SQLCipher/SQLite, filesystem streams, session
  storage, and the persistent Docker volume.
- The React frontend communicates only with the same-origin API and does not
  persist financial records in browser storage or service-worker caches.
- Flutter adapters use Drift/SQLite, SQLCipher libraries, platform secure
  storage, `local_auth`, filesystem APIs, and platform-specific backup controls.
- Desktop plugins must be wrapped behind application-owned interfaces so plugin
  changes do not leak into domain or presentation code.

### 6.5 User interfaces

The web client implements the repository's own design system — *Sovereign
Ledger*, re-tokened from the redrawn `ui/*` mockups and summarized in
`docs/DESIGN.md` — with one sidebar shell and six sections: Dashboard, Accounts,
Transactions, Tags, Rules and Settings. Settings opens with the Enable Banking
connection and then carries the passphrase change plus export and import. The
shell's top bar carries the section title, the clock and the session controls,
and the sidebar is the brand and the six sections; cards are white with a
hairline outline over a slate canvas, tinted
panels carry nested controls, and the dashboard charts cash flow per month and
spending as a donut per currency. The dashboard is scoped by the period the
reader picks — a preset, a year strip or any combination of months as removable
chips — and by nothing else: the figures, the chart and the recent movements
describe every category of those months, and a legend row opens the ledger on
its tag. The transactions ledger reads its
rows from the server one page at a time — 25 by default, with a page-size
selector, the visible range and Previous/Next — so a vault with thousands of
movements is browsable instead of truncated. Only implemented features are
rendered, fonts use local stacks so the app never needs a CDN, and
`docs/DESIGN.md` records the tokens, the brand assets shipped from
`apps/web/public` and the mapping. The Flowly lockup — a white keyhole in a
squircle filled with the brand gradient, deep green `#0b3d2e` → medium green
`#1e6f4e` → gold `#d4af37` — carries the product's own actions, the sidebar tile
and the progress bars; everything else stays a semantic colour.

The two UIs follow one product design specification but are implemented with
their own toolkit:

- React provides the LAN web interface, with browser accessibility semantics and
  a layout that adapts to the width of the window.
- Flutter provides the desktop application from one Dart widget codebase.
- Both use a sidebar shell and support keyboard navigation.
- WCAG 2.2 AA target for the web UI
- Flutter semantics and platform accessibility checks for the desktop client
- Locale-aware dates, amounts, and currencies
- No raw HTML rendering from imported or provider-supplied text
- Shared design tokens may be generated from neutral JSON, but widgets and
  components are not shared.

## 7. Data Model

All primary identifiers are generated locally using UUIDv7. Records retain
stable identifiers through export/import.

### 7.1 Financial account

Required fields:

- `id`
- `name`
- `type`: checking, savings, credit card, cash, wallet, investment, other
- `defaultCurrency`
- `institutionName` optional
- `openingBalanceMinor` optional
- `archivedAt` optional
- `createdAt`
- `updatedAt`

An account cannot be hard-deleted while transactions reference it. It may be
archived, or deleted only through an explicit cascade confirmed by the user.

### 7.2 Transaction

Required fields:

- `id`
- `accountId`
- `bookingDate`
- `amountMinor`, signed: inflow positive and outflow negative
- `currency`
- `payee` optional
- `description` optional provider/import description
- `userNote` optional user-authored text
- `status`: pending or booked
- `source`: manual, CSV import, or Enable Banking
- `createdAt`
- `updatedAt`

Optional interoperability fields:

- `valueDate`
- `originalAmountMinor`
- `originalCurrency`
- `provider`
- `providerAccountId`
- `providerTransactionId`
- `importFingerprint`

`Enable Banking` is reserved for forward-compatible contracts and becomes an
active source only when the post-MVP connector is implemented.

The provider description and user note are separate so a future refresh never
overwrites user content.

### 7.3 Tags

- `tags`: `id`, unique normalized name, display name, optional color
- `transaction_tags`: composite key of transaction and tag identifiers

Tag comparison is Unicode-normalized and case-insensitive. Display casing is
preserved.

### 7.4 Tagging rules

Delivered in the Server MVP with Phase 3. Rules are authored by the user and
apply automatically to new and imported transactions.

- `id`
- `name`
- `enabled`
- `combinator`: `and` or `or`
- `conditions`: ordered list of `{ field, operator, value }`
- `tagIds`: one or more tags to add
- `createdAt`
- `updatedAt`

Supported condition fields and operators:

- `userNote contains`, `description contains` — Unicode-normalized,
  case-insensitive substring match
- `payee is`, `payee contains` — normalized equality or substring match
- `amount greater than`, `less than`, `equals` — the amount written as a
  canonical decimal string in the condition's own currency (`-5.10` is an
  outflow of 5.10), where inflows are positive and outflows are negative; the
  server parses it into exact minor units, and each amount condition carries a
  currency and matches only transactions in that currency, with no implicit
  conversion
- `accountId is` — exact account identifier

A rule joins its conditions with a single AND or OR. Nested groups are out of
scope for the MVP. Every rule that matches applies its tags, and the resulting
tags are a set, so evaluation is order-independent.

A rule holds at most 25 conditions and assigns at most 25 tags; the API and the
editor enforce both limits.

Rules run when a transaction is created manually, merged from CSV, or imported
from Enable Banking (Phase 6). Editing an existing transaction does not re-run
rules. An explicit backfill
action applies rules to existing transactions and is idempotent.
`GET /api/tagging-rules/stats` counts what the stored rules cover across the
whole ledger — per rule, per applied tag and in total — and
`POST /api/tagging-rules/preview` runs the same evaluation for an unsaved
condition set over the most recent transactions. Both only read the vault, so
the editor can say what a rule would do before it is saved.

Rules only add tags. They never remove tags or modify other fields, and Flowly
does not track which rule added which tag: editing or deleting a rule leaves
previously applied tags in place.

### 7.6 Operational metadata

Persist:

- Schema version
- Vault format version
- Import history
- Export format version
- Migration history
- User preferences

Never place passphrases, unwrapped keys, Enable Banking private keys, access
tokens, or complete sensitive payloads in logs or telemetry.
Request logging keeps the method and path but removes every query string; the
reverse proxy omits the Enable Banking callback because its URL carries a
single-use authorization code and state.

### 7.7 Enable Banking tables

The connector adds four tables, all inside the same encrypted vault and all
covered by the portable exports:

- `bank_connections`: the Enable Banking application (id, app id, private key
  PEM, callback URL, environment, default country and PSU type, automatic
  refresh). One row per vault.
- `bank_links`: one row per authorized bank. Holds the ASPSP name and country,
  PSU type, the single-use OAuth state and its expiry, the session id, the
  consent validity, the status (`pending`, `authorized`, `expired`, `revoked`,
  `failed`, `closed`) and the last sync result. While the link is pending it
  also keeps the provider authorization URL, so the browser can be sent back to
  the bank after a reload (`docs/adr/0017`).
- `bank_accounts`: one row per provider account discovered in a link, with the
  identification hash, IBAN, currency and cash-account type, the mapping status
  (`unmapped`, `mapped`, `ignored`), the Flowly account it feeds, the sync
  cursor and the last reported balance. For a paired account that reported
  balance **is** the account balance everywhere in the product, and the vault
  falls back to its own opening-balance arithmetic only when no bank reports one
  (`docs/adr/0019`).
- `bank_payloads`: the raw JSON store. One row per response per account —
  session, account details, balances and each page of transactions — with the
  request window, the fetch timestamp and the provider JSON untouched.

Provider timestamps arrive as RFC 3339 with a `+00:00` offset and up to six
fractional digits, so they are normalized to Flowly's canonical UTC form before
they are stored. Amounts keep the provider sign convention (`CRDT`/`DBIT` plus
an unsigned magnitude) and are converted to signed minor units.

## 8. Local Storage Strategy

### 8.1 Desktop application

Use Flutter with Drift over SQLite and a SQLCipher-compatible native library.
The current leading candidate is `sqlcipher_flutter_libs` with `sqlite3`/Drift,
but it is not accepted until the architecture spike proves installation,
encryption, migrations, release builds, and licensing on macOS and Windows.

Required behavior:

- WAL/journal files and temporary files are encrypted or configured so they
  never contain plaintext.
- Foreign keys are enabled.
- Migrations are transactional and forward-only.
- Database backups are not copied to cloud backup locations unless explicitly
  approved and encrypted.
- Desktop database files use restrictive filesystem permissions.

### 8.2 Self-hosted web service

The server deployment is the source of truth for all of its browser sessions.
Phase 0 proved SQLCipher 4 through `@journeyapps/sqlcipher` on
`linux/arm64` and `linux/amd64`, so SQLCipher is the primary engine. Keep it
behind a storage adapter and retain `node:sqlite` plus AES-256-GCM record
encryption as the fallback when the native build is unavailable on a supported
host.

- Store the database, journal, and migration state in a persistent Docker
  volume with restrictive host permissions.
- Encrypt journals, temporary database files, and migration snapshots or ensure
  they never contain plaintext.
- Run one service instance as the sole database owner; serialize migrations and
  use database transactions for multi-record writes.
- Serve the React UI and API from one origin behind an HTTPS reverse proxy.
- Bind only to the explicitly configured LAN interface. Do not configure port
  forwarding, public ingress, or an Internet-facing default.
- Do not persist financial records, passphrases, session tokens, or decrypted
  API responses in browser storage, Cache Storage, or service workers.
- Start locked after every service restart. Keep unwrapped keys in server memory
  only while at least one authorized session remains active.
- Require a persistent-volume backup or encrypted rollback snapshot before
  applying a database migration.

The web interface requires connectivity to the self-hosted server but no
Internet connection or third-party service.

### 8.3 Storage contract tests

Define one language-neutral behavioral specification and fixture set. Implement
equivalent suites in TypeScript and Dart against the server and desktop storage
adapters. CI must compare canonical outputs. The suites verify:

- CRUD behavior
- Transactions and rollback
- Referential integrity
- Date and currency round trips
- Search/filter equivalence
- Migration from every supported previous schema
- Lock/unlock behavior
- Corrupted ciphertext handling
- Import deduplication

## 9. Cryptographic and Unlock Design

### 9.1 Key hierarchy

1. Generate a random 256-bit data-encryption key (DEK) when creating a vault.
2. Derive a key-encryption key (KEK) from the local passphrase using Argon2id
   with a unique random salt.
3. Benchmark Argon2id parameters per platform against a documented security and
   usability target. Store the algorithm and parameters with the wrapped key.
4. Wrap the DEK using an authenticated-encryption construction from an audited
   library.
5. Use the unwrapped DEK for SQLCipher or web record encryption.
6. Keep the unwrapped DEK in memory only while the vault is unlocked.

Do not implement cryptographic primitives manually.

Phase 0 established the concrete construction: Argon2id through
`@node-rs/argon2` with a 16-byte salt and versioned parameters (default
19 MiB, t=2, p=1, 32-byte output, measured at 22.9 ms per unlock), AES-256-GCM
to wrap the DEK with the vault identifier as additional authenticated data, and
HKDF-SHA256 subkeys per purpose. Parameters are stored with the vault so they
can be strengthened later without re-encrypting data.

### 9.2 Optional biometric unlock

Biometrics are a convenience mechanism, not the only recovery mechanism:

- macOS: Keychain protected by the system biometric policy
- Windows: DPAPI and, where practical, Windows Hello-backed protection
- Self-hosted web: passphrase unlock only in the MVP; WebAuthn convenience
  unlock is deferred

The platform store contains only a device-bound wrapping key or wrapped DEK,
never the user's passphrase.

### 9.3 Lock behavior

- Lock on explicit user action.
- Auto-lock after a configurable inactivity interval.
- Lock when the desktop app is hidden beyond a short grace period.
- Clear decrypted caches and sensitive form state on lock.
- Prevent sensitive screenshots and window previews where the platform supports
  it.
- Require re-authentication before exporting all data or changing the
  passphrase.
- On the web, `Lock this device` revokes only the current server session.
- On the web, `Lock all devices` revokes every session, closes database
  connections, and removes unwrapped keys from server memory as far as the
  runtime permits.
- A web session expires independently after inactivity. The server vault closes
  when no authorized sessions remain.
- Use random `HttpOnly`, `Secure`, `SameSite=Strict` cookies. Never store the
  passphrase or bearer session credentials in browser storage.
- Apply unlock rate limits, CSRF protection, strict origin checks, and explicit
  session revocation.

### 9.4 Passphrase change and loss

- Changing the passphrase re-wraps the DEK; it does not rewrite the database.
- There is no recovery service because there is no user account or cloud key
  escrow.
- The UI must clearly warn that losing the passphrase and all unlocked devices
  means permanent data loss.
- Recovery is possible only from an export whose password is known.

## 10. CSV Import and Export

### 10.1 Export formats

Provide three workflows:

1. **Transaction CSV:** one human-readable RFC 4180-compatible CSV for analysis
   in spreadsheet tools.
2. **Plain-text tables ZIP:** one CSV per table plus a manifest, so a user who
   leaves Flowly takes every record with them in a format any tool reads
   (`docs/adr/0014`). Built in memory, never written to the server's disk, and
   explicitly not a restore path.
3. **Complete portable export:** a password-encrypted, versioned archive
   containing CSV files for accounts, transactions, tags, transaction-tag
   links, tagging rules, and preferences, plus a small manifest
   containing format and checksum metadata.

The complete export is the supported device-to-device transfer format. The
archive contents remain CSV-oriented while preserving normalized relationships.
Tagging rules ship inside archive format version 1 because they land in the
Server MVP; the rule record itself is at format version 2 (ADR 0026), and the
server upgrades version 1 rules on unlock and on archive import.

### 10.2 Encoding and representation

- UTF-8
- RFC 4180 quoting and escaping
- ISO 8601 dates and timestamps
- Stable UUIDs
- Explicit ISO 4217 currencies
- Amounts exported as canonical decimal strings and imported into minor units
  with strict currency-aware validation
- Formula-injection mitigation for spreadsheet-facing fields beginning with
  `=`, `+`, `-`, or `@`
- Deterministic column names and a documented schema version

### 10.3 Export security

Plain CSV is not encrypted. The product must:

- Warn the user before creating a plaintext export.
- Stream the export to the selected destination without leaving unmanaged
  temporary plaintext files.
- Avoid including internal cryptographic metadata.
- Require password encryption for every complete portable archive while
  retaining plaintext transaction CSV for interoperability.
- Never upload exports automatically.

### 10.4 Import workflow

Import is a staged, transactional operation:

1. Select file.
2. Detect format and version.
3. Parse in a worker/background task.
4. Validate headers, types, dates, amounts, currencies, references, file size,
   and row count.
5. Show a preview with errors and duplicate counts; for a transaction CSV merge,
   also show the tags that tagging rules would add.
6. For a transaction CSV, preview and merge valid rows. For a complete portable
  archive, confirm replacement of the entire current vault.
7. Write atomically.
8. Show a durable import report.

Importing a complete portable archive always uses `Replace`. It requires
explicit destructive confirmation and creates a local encrypted safety
snapshot first. The archive is fully decrypted, authenticated, and validated
before the current vault is changed. Any validation or write failure leaves the
previous vault intact.

Transaction CSV import is additive and uses deduplication. It never represents
or replaces a complete vault.

Deduplication order:

1. Stable Flowly UUID
2. Provider plus provider account plus provider transaction ID
3. Deterministic import fingerprint over normalized account, date, amount,
   currency, and description

An import must never silently discard an invalid or conflicting row.

## 11. Dashboard, Search, Multi-Currency, Recurrence, and Tagging Rules

### 11.1 Dashboard

The initial dashboard includes:

- Balance by account
- Net cash flow for a selected period
- Income and expense totals
- Spending by tag

### 11.2 Search and filters

Support combinations of:

- Date range
- Account
- Tag
- Amount range
- Currency
- Pending/booked status
- Source
- Payee/description/user-note text

Search semantics must match across the desktop and server adapters.

### 11.3 Multi-currency

The MVP:

- Preserves each transaction's original currency.
- Calculates per-currency totals without inventing conversions.
- Does not combine balances from different currencies into one number unless an
  explicit exchange-rate source and valuation date are available.
- Allows manually entered original and converted amounts.

Automatic foreign-exchange rate retrieval is out of scope.

### 11.4 Recurrence

Delivered in Phase 7, after Enable Banking for Server and before the desktop
application.

Rules use calendar-aware arithmetic, not fixed day counts for monthly or yearly
periods. Time-zone and end-of-month behavior must be covered by tests.

### 11.6 Tagging rules

Rules are managed in a dedicated settings area with a list view and an editor
for name, conditions, and tags.

- Creating or editing a rule previews how many existing transactions match and
  shows a small sample before saving.
- Each rule can be paused without deleting it.
- A backfill action applies rules to existing transactions, scoped by optional
  account, date range, or the current search filters, with a preview count and a
  report of how many transactions changed. Backfill is idempotent.
- The import preview labels the tags that tagging rules would add, so imports
  stay predictable.

## 12. Enable Banking Integration

Enable Banking is delivered in two steps: Phase 6 integrates the connector with
the released server, and Phase 11 integrates the same connector contracts with
the desktop application. Neither step introduces synchronization between vaults.
The server half is implemented in `apps/server/src/banking/` (`docs/adr/0016`).

### 12.1 Security boundary

Enable Banking application private keys and JWT signing never ship in the web or
desktop clients. Reverse engineering a distributed client would expose those
credentials, so signing happens only on the server, and the key lives in the
encrypted vault:

- The connection is configured from Settings: application id, the `.pem` private
  key, the callback URL, the environment and the default country/PSU type.
- Saving calls `GET /application` first, so a wrong key, a wrong environment or a
  callback URL that is not among the application's registered redirect URLs is
  rejected before anything is stored.
- The API returns the application id and a hash of the matching **public** key,
  never the private key, and the frontend secret scan still fails the build if a
  `VITE_*` name looks like a secret.
- Every request is signed with a short-lived RS256 JWT (`kid` = application id,
  maximum lifetime one day).
- Callbacks are validated against a cryptographically random, single-use state
  with a 15-minute expiry; a replayed callback is rejected.
- The PSU IP and user agent of the requesting browser are forwarded only when a
  bank requires PSU headers; no financial payload is ever logged.

### 12.2 Preserve the no-sync product rule

The connector is an ingestion channel, not the canonical database:

- The server vault links and imports independently in Phase 6: connecting a bank
  asks whether to create a Flowly account or pair an existing one, and unmapped
  accounts are never imported.
- The desktop vault links and imports independently in Phase 11.
- The destination encrypted vault remains the source of truth.
- The connector does not provide cross-device synchronization.
- Raw provider responses are kept per account in `bank_payloads` inside the
  encrypted vault as the audit trail, and unlink deletes them along with the
  link.
- User notes and tags remain local and are never overwritten by provider
  refreshes.
- Tagging rules run on the imported batch, so imported transactions land with
  their tags in one atomic write.
- Unlinking a bank keeps every imported transaction; only the link, its account
  mappings and its raw payloads go away.

### 12.3 Provider deduplication

Prefer provider transaction IDs. Where institutions do not provide stable IDs,
use a versioned fingerprint and retain provider raw identifiers needed for
reconciliation. Pending-to-booked transitions must update an existing
transaction rather than create a duplicate when a reliable match exists.

Implemented as: `entry_reference` (then `transaction_id`) is stored as
`providerTransactionId`, with the versioned import fingerprint as the fallback
match. Every sync re-reads a seven-day overlap before the stored cursor, so a
pending transaction that the bank later books updates in place, keeping the
user's note and tags.

### 12.4 Connector requirements

The connector is written from the provider's documented API, inside the server:

- Credentials live in the encrypted vault and never in the browser bundle or in
  a plain file on the server.
- Requests carry explicit timeouts, retries with bounded backoff, pagination and
  rate-limit handling. The one exception is the bank's own cap on the number of
  reads a consent allows per day (`ASPSP_RATE_LIMIT_EXCEEDED`): that is not
  transient, so the client does not retry it, keeps the `Retry-After` the
  provider sent and hands the refusal back to the sync.
- A single sync runs at a time; concurrent requests join the run in progress.
- Sandbox fixtures are sanitized and covered by tests; real transaction files
  are never committed.

### 12.5 Refresh behaviour

- Unlocking the vault can trigger a background refresh of every linked bank, but
  only when the setting asks for it: it is **off by default**, because every
  read spends the consent's daily access budget and banks grant only a few. The
  unlock response never waits for the provider, and failures are reported on the
  link instead of blocking the session.
- A connection stored while that refresh was still the default holds a `true`
  nobody chose; the first read turns it off and marks the record, and a
  connection deliberately switched back on keeps its setting from then on.
- A bank that refuses a read for its daily cap stops the run where it is — the
  remaining accounts and links are not asked — and the link records the instant
  Flowly will try again. The wait starts at six hours and doubles on every
  further refusal up to a 24-hour ceiling; a link inside its wait is skipped
  without touching the provider, and a sync that completes clears both the wait
  and the escalation.
- The dashboard shows the last sync, the sync in progress and a **Sync now**
  button for a manual refresh, plus the connection state of every bank and, when
  the bank is refusing, when Flowly will try again.
- The first sync of an account looks back 90 days; later syncs resume from the
  stored cursor with the seven-day overlap.
- A bank whose consent expired or was revoked is marked `expired` and reported
  for reconnection; its imported transactions stay in the ledger.
- Transactions whose currency Flowly cannot represent yet, or that arrive
  without an amount or a usable date, are skipped and reported per account
  instead of failing the sync.

## 13. Security Requirements and Threat Model

### 13.1 Assets

- Financial transactions and balances
- User notes and tags
- Vault encryption keys
- Passphrase-derived material
- Export files
- Bank session tokens and the Enable Banking signing key

### 13.2 Primary threats and controls

| Threat | Required controls |
|---|---|
| Stolen device or copied database | SQLCipher or authenticated record encryption; OS secure key storage; auto-lock |
| Browser origin compromise or XSS | Strict CSP, no inline/eval code, Trusted Types where supported, output encoding, dependency review, no browser-side vault persistence |
| LAN interception or session theft | Mandatory HTTPS, secure same-origin cookies, CSRF protection, origin validation, short idle expiry, session revocation |
| Compromised server host while unlocked | Minimize unlocked lifetime, keep keys only in memory, restrictive service account and filesystem permissions, documented residual risk |
| Malicious CSV | Size/row limits, streaming parser, strict schema, formula neutralization, no HTML execution, atomic rollback |
| Weak passphrase attacks | Argon2id, per-vault salt, calibrated parameters, strength guidance, no recovery hints |
| Plaintext leakage in logs/crash reports | Structured redaction, no payload logging, production source-map policy, sanitized crash reports |
| Supply-chain compromise | Lockfiles, dependency update policy, provenance/SBOM, CI secret isolation, signed releases |
| Tampered desktop updates | Signed installers and verified update metadata |
| OS backup leakage | Backup exclusion or encrypted backup only |
| Memory inspection on compromised device | Minimize unlocked lifetime and decrypted caches; document that full compromise cannot be completely mitigated |
| Enable Banking key extraction | Server-only key custody: the private key lives in the encrypted vault, is never returned by the API, and never ships in any client bundle |
| A stale or revoked bank consent | Consent validity is stored per link, the session status is checked before every sync, and an expired consent is marked and reported instead of failing silently |

### 13.3 Application security controls

- Validate all data at trust boundaries with runtime schemas.
- Use parameterized SQL exclusively.
- Request the minimum platform permissions and audit every plugin and platform
  channel the desktop client ships.
- Disable unnecessary network access in installed clients for the MVP.
- Use HTTPS and a restrictive same-origin `connect-src` policy for the
  self-hosted web service.
- Pin allowed navigation and deep-link origins.
- Protect release signing keys outside CI job logs and artifacts.
- Provide a data deletion action that erases the local vault and wrapped keys.
- Document platform limitations honestly; encryption cannot protect an unlocked
  app on a fully compromised OS.

## 14. Privacy Requirements

- No account registration.
- No analytics or telemetry in the MVP by default.
- No third-party advertising or tracking SDKs.
- No automatic cloud backup or upload.
- The desktop application has no network dependency for core usage. The web UI
  depends only on private-network access to the user's server and never on
  Internet access or a Flowly-operated service.
- Collect only data entered/imported by the user.
- Provide explicit local data deletion and export controls.
- Future connector retention and deletion policies must be documented before
  implementation.

## 15. Non-Functional Requirements

### Reliability

- All multi-record writes are atomic.
- Interrupted imports leave the prior vault intact.
- Migrations are recoverable and tested from all supported versions.
- Corruption and authentication failures produce actionable errors, never empty
  success states.

### Performance

- Define a representative data set of at least 100,000 transactions for
  profiling.
- Common filtered views and dashboard summaries should remain interactive on
  supported hardware.
- Server-side decryption, queries, and CSV parsing must not block HTTP request
  handling or the browser UI.
- Large exports/imports are streamed where APIs allow.

### Accessibility

- WCAG 2.2 AA for the web application.
- Screen-reader labels, logical focus order, keyboard operation, visible focus,
  reduced-motion support, and color-independent status indicators.

### Internationalization

- UI text is externalized from the start.
- Store canonical dates/currencies; format only at presentation boundaries.
- Support locale-specific display while preserving deterministic export
  formats.

### Compatibility

- Define and publish a supported OS/browser matrix before release.
- The web baseline should include current stable Safari, Chromium, and Firefox,
  plus a documented HTTPS certificate-enrollment flow for supported desktop
  operating systems.

## 16. Testing and Quality Strategy

### Automated tests

- TypeScript domain and property-based tests for money, deduplication, and CSV
  round trips during Server MVP development
- Workspace gate on every change: Prettier, ESLint, the frontend environment
  guard, TypeScript across all packages, Vitest suites, and a
  contract-regeneration diff that fails when generated code drifts from
  `contracts/`; CI additionally scans the complete Git history with a pinned
  Gitleaks image
- Server storage contract, migration, crypto known-answer, and tamper tests
- React component and accessibility tests
- Tagging rule contract, normalization, AND/OR, amount-currency, account,
  import-preview, and idempotent backfill tests in Phase 3, with golden
  rule-evaluation vectors shared with the Dart desktop client
- Migration tests from every released schema
- Multi-architecture container, HTTPS, session, restart, concurrent-edit, and
  update tests on Linux amd64/arm64 and Docker Desktop on macOS/Windows
- End-to-end workflows for create, lock-current, lock-all, unlock, CSV merge,
  complete-vault replace, export, and delete
- Connector tests using sanitized Enable Banking fixtures: JWT signing and
  verification, normalization of debits/credits and pending/booked rows,
  idempotent sync, pending-to-booked reconciliation, expired consent, raw
  payload storage, and the portability round trip (Phase 6)
- Equivalent Dart domain, property-based, storage, crypto, component, and
  accessibility tests for the desktop client beginning in Phase 8
- Cross-language golden-vector and portable-archive conformance tests in Phases
  8-11
- Platform smoke tests on macOS and Windows beginning in Phase 8

### Security verification

- Static analysis for TypeScript in Server MVP phases and Dart for the desktop
  client from Phase 8
- Dependency and license scanning
- Secret scanning
- Desktop checks aligned with the OWASP MASVS desktop guidance from Phase 8
- Web checks aligned with OWASP ASVS
- Threat-model review before beta
- Independent review of key management and export handling before production

## 17. Delivery Plan and Tasks

Phases 0-5 are strictly server-first. They deliver the first releasable product,
the **Flowly Server MVP**. After that release gate, Phase 6 adds Enable Banking
for Server, and desktop application work begins in Phase 8. Phase 7 (recurring
transactions) and its tasks were removed from the plan in `docs/adr/0015`; the
remaining phase numbers are kept as published so earlier records stay accurate.

### Phase 0 - Server architecture and security feasibility

Status: **complete** (2026-09-11). Results, measurements and reproduction
commands are in `spikes/server-architecture/REPORT.md`; the binding decisions are
recorded in `docs/adr/0001`-`docs/adr/0004`. The 23-test spike suite passes, and
the vault lifecycle was verified in containers on `linux/arm64` and
`linux/amd64` with no plaintext artifacts.

#### Task `server-architecture-spike`

- Build throwaway proof-of-concepts for:
  - SQLCipher or authenticated record encryption from TypeScript
  - Docker images on Linux amd64/arm64 and Docker Desktop on macOS/Windows
  - Persistent volumes, encrypted migrations, and update rollback
  - Private-network HTTPS, session revocation, auto-lock, and concurrent browser
    access
  - CSV and encrypted portable-archive round trips
- Record selected libraries, licenses, maintenance health, supported versions,
  image size, performance, and failure behavior.
- Test wrong-key, corrupted-data, interrupted-write, restart, and stale-session
  cases.

**Exit criteria:** every supported Docker platform can create, lock, reopen,
migrate, export, and delete an encrypted vault without plaintext artifacts.

Met on Linux `arm64` and Linux `amd64` (the latter through Docker Desktop
emulation on Apple Silicon). A native `amd64` host and Docker Desktop on Windows
remain to be confirmed during Phase 1 CI setup.

### Phase 1 - Server foundation

Status: **complete** (2026-09-11). `pnpm verify` runs the whole gate — Prettier
check, ESLint, frontend secret scan, TypeScript across all packages, and 64
tests (contracts 11, server 51, web 2). `pnpm build` compiles the server and
bundles the web client, and `apps/server/Dockerfile` builds for `linux/amd64`
and `linux/arm64` in CI. See `docs/adr/0005-phase-1-workspace-and-toolchain.md`.

Delivered:

- A pnpm workspace with `apps/server`, `apps/web`, and
  `packages/web-contracts`, plus root scripts for dev, build, test, lint,
  formatting, contract generation and the full `verify` gate.
- Canonical contracts in `contracts/`: JSON Schema 2020-12 definitions, valid
  fixtures, and golden vectors for money and tagging-rule evaluation. Codegen
  produces TypeScript types and Ajv validators, and CI fails when the generated
  output drifts from the schemas.
- Domain invariants for money and currency, accounts, transactions, tags,
  and tagging rules, with UUIDv7 identifiers and the versioned import
  fingerprint.
- A Fastify same-origin API serving `/api/health`, a contract-validated
  `/api/vault/status`, `/api/contracts`, and an explicit `501` for unlock until
  Phase 2 implements it.
- A React locked-vault shell that reads the vault status through the same-origin
  API, with component tests for the success and unreachable-server paths.
- Environment validation that refuses a public bind without an explicit opt-in
  and blocks secret-looking `VITE_*` variables.

#### Task `scaffold-server`

- Create the TypeScript workspace, React/Vite UI, server API, Docker Compose
  deployment, and root command surface.
- Configure strict TypeScript analysis, formatting, testing, CI, multi-arch
  image builds, and environment validation.
- Prohibit secrets in frontend build variables and validate private-network
  deployment defaults.

#### Task `define-contracts-and-server-domain`

- Define canonical JSON schemas, CSV/archive schemas, fixture formats, and
  versioning conventions without coupling them to TypeScript storage details.
- Implement TypeScript money, currency, account, transaction, tag, tagging-rule,
  and recurrence models and invariants.
- Define server repository and platform-service interfaces.
- Add golden expected results, including tagging-rule evaluation vectors, that
  the later Dart implementation must consume unchanged.

**Exit criteria:** the TypeScript domain suite runs without UI or infrastructure
dependencies, and the React UI renders a locked-vault shell from the server API.

Met: the domain suite runs with no UI or storage dependency, the web shell
renders from `/api/vault/status`, and the proxy path was verified against a
running server. Serving the built web client from the server itself belongs to
the Phase 5 deployment work.

### Phase 2 - Server vault and persistence

Status: **complete** (2026-09-11). `pnpm verify` runs 101 tests (contracts 11,
server 88, web 2), including the storage contract suite executed against both
engines. The container smoke test created a vault, restarted the container, and
proved the service comes back locked and can be unlocked again. Decisions are
recorded in `docs/adr/0006-vault-sessions-and-optimistic-concurrency.md`.

Delivered:

- Vault lifecycle: create, Argon2id passphrase derivation, DEK wrapping with
  AES-256-GCM bound to the vault id, unlock, passphrase change without
  re-encrypting data, lock, lock-current, lock-all, encrypted snapshots and
  deletion, with key material zeroized on lock.
- Encrypted storage: SQLCipher 4 behind the adapter from ADR 0001, plus the
  `node:sqlite` + AES-256-GCM fallback, versioned transactional migrations with
  crash injection, indexed reference columns, and 0600 file permissions.
- Repositories for accounts, transactions, tags and tagging rules, every write
  guarded by an integer revision; a stale revision
  returns an explicit conflict instead of overwriting.
- Browser sessions with `HttpOnly; SameSite=Strict` cookies, idle and absolute
  expiry, per-session CSRF tokens, origin validation, unlock rate limiting,
  auto-lock when no session remains, and an explicit 423 when a valid session
  meets a locked vault.

#### Task `implement-server-vault`

- Implement vault creation, Argon2id passphrase derivation, DEK wrapping,
  unlock, passphrase change, auto-lock, lock-current, lock-all, and deletion.
- Implement secure browser sessions, inactivity expiry, rate limiting, CSRF
  protection, origin validation, and sensitive-memory lifecycle rules.

#### Task `implement-server-storage`

- Implement the selected encrypted SQLite adapter on every supported Docker
  platform.
- Add persistent-volume handling, migrations, indexes, transactional
  repositories, encrypted rollback snapshots, and restrictive permissions.
- Add same-origin API adapters and optimistic concurrency for browser edits.
- Run the server storage contract suite.

**Exit criteria:** tampering and wrong keys fail closed, restarts return to a
locked state, and concurrent browser edits never overwrite silently.

Met, and covered by tests: a tampered wrapped key or a wrong passphrase is
rejected with an authentication error, a new process (and a new container)
starts locked against the same volume, and a write carrying a stale revision
returns `409 revision_conflict` with the current revision.

### Phase 3 - Server core finance and portability

Status: **complete** (2026-09-11). `pnpm verify` runs 119 tests (contracts 11,
server 104, web 4), including CSV round trips, archive replacement, cascade
rules, tagging backfill and the API routes. The container smoke test still
creates a vault, restarts the container and unlocks it. Decisions are recorded
in `docs/adr/0007-finance-cascades-and-portability.md`.

Delivered:

- Account, transaction, tag and note CRUD over the repository layer with
  revision-checked writes, archive-instead-of-delete for accounts (reversible
  through `POST /api/accounts/:id/restore`, `docs/adr/0013`), and explicit cascade
  confirmations for accounts and tags. `409` responses carry the counts the user
  is about to remove.
- Tagging rules: CRUD, evaluation on manual creation and CSV merge, and an
  explicit idempotent backfill with an evaluated/changed report.
- Transaction CSV export and import following
  `contracts/csv/export-format-v1.md`: RFC 4180, canonical decimal amounts,
  formula-injection protection, preview with duplicates/new tags/unknown
  accounts, and an additive merge that reports created, skipped, invalid and
  rule-tagged rows.
- Complete portable archive: gzipped tar with a checksum manifest validated
  against `archive-manifest.schema.json`, AES-256-GCM under an Argon2id-derived
  key, encrypted safety snapshot before replacement, atomic replace, and loud
  failures for a wrong password, tampering or an inconsistent archive.
- React vault shell with unlock/create and the Accounts, Transactions, Tags and
  Rules sections, with accessible forms and plain-language error states including
  revision conflicts.

#### Task `implement-server-core-finance`

- Build account, transaction, tag, and note CRUD in the server and React UI.
- Add archive/cascade rules, destructive confirmations, validation, accessible
  forms, and actionable error states.

#### Task `implement-server-auto-tagging`

- Implement tagging-rule CRUD, enable/pause state, validation, and the
  deterministic rule engine in the server API and React UI.
- Run rules on manual transaction creation and CSV merge, keeping rule
  evaluation inside the same atomic write as the transaction batch.
- Show the tags that rules would add in the import preview and in the rule
  editor's live match preview.
- Add the backfill action scoped by optional account, date range, or current
  search filters, with a match preview and a durable change report.

#### Task `implement-server-csv-transfer`

- Define and document export format version 1.
- Carry tagging rules in the complete portable export as part of format version
  1.
- Implement transaction CSV and password-encrypted complete portable exports in
  TypeScript.
- Implement preview, validation, CSV merge, complete-vault replace, encrypted
  safety snapshots, rollback, and import reports.
- Add malicious, large, and corrupt file tests plus spreadsheet formula
  protection.

**Exit criteria:** server exports round-trip without changing IDs, amounts,
dates, relationships, notes, or tagging rules; complete imports always replace
atomically.

Met: the CSV and archive round-trip tests assert stable ids, amounts, dates,
notes, tag links and tagging rules across vaults; a failed or inconsistent
archive leaves the destination vault untouched, and a successful one replaces
it inside a single transaction after writing an encrypted snapshot.

### Phase 4 - Server analysis features

Status: **complete** (2026-09-11). `pnpm verify` runs 148 tests (contracts 10,
server 126, web 12), including the analytics and search suites. Decisions are
recorded in `docs/adr/0008-dashboard-search-and-budget-semantics.md`; its budget
parts are superseded by `docs/adr/0010-remove-budgets.md`.

Delivered:

- Dashboard aggregates computed from signed minor units and ISO calendar dates:
  balances per account and currency, cash flow per currency and spending by tag.
  Booked transactions only; currencies are never blended.
- Server-side transaction search: date range, account, tag, currency, status,
  source, amount range, free text across payee/description/notes, pagination and
  a total. The SQL layer narrows on the indexed columns and the rest is filtered
  in memory.
- Migration 2 adds date and update indexes for the dashboard ranges, and an
  in-memory aggregate cache keyed by a cheap table fingerprint keeps repeated
  dashboard reads fast without persisting anything derived from decrypted data.
- `dashboard.schema.json` joins the contracts, so the dashboard response is
  validated at runtime and the shape is shared with the future Dart desktop
  client.
- React dashboard section plus server-side filters in the transactions section,
  and the Settings section that opens with the bank connection and consolidates
  the passphrase change with export and import
  (`docs/adr/0011-ui-design-system.md`).

#### Task `implement-server-dashboard-search`

- Add dashboard summaries, date ranges, account/tag filters, and text search.
- Add performance indexes and caches without weakening encryption boundaries.

**Exit criteria:** calculations are deterministic across locale and time zone,
and the reference data set remains interactive on supported hosts.

Met: every calculation uses integer minor units and ISO dates with no locale or
local-time formatting, the analytics suite asserts exact values for balances,
cash flow and spending, and the reference data set stays interactive
because ranges are narrowed on indexed columns and repeated aggregates are
cached in memory.

### Phase 5 - Server hardening and release

Status: **complete for its engineering scope** (2026-09-11). `pnpm verify` runs
148 tests (contracts 10, server 126, web 12). Two verification items cannot be
finished by writing code in this repository — an independent cryptographic
review and a full assistive-technology accessibility audit — and are tracked as
open in `docs/security/verification.md`. Decisions are recorded in
`docs/adr/0009-deployment-transport-and-release.md`.

Delivered:

- The server serves the built React client on the same origin with an SPA
  fallback, sets CSP and the other security headers, and exposes
  `/api/system/info` for operations.
- `deployment/self-hosted/compose.yaml` runs the server behind a Caddy reverse
  proxy that terminates HTTPS with a local CA, keeps both published ports on the
  loopback interface, and health-checks both containers.
- The image pins the Node base by its multi-architecture digest, carries OCI
  labels, builds the web client, and is produced for `linux/amd64` and
  `linux/arm64` with SBOM and provenance attestations in CI. Its publication
  waits for a pinned Gitleaks scan of the complete Git history.
- `pnpm release:report` generates `docs/security/sbom.json` (CycloneDX 1.5) and
  the third-party license inventory; `pnpm release:check` fails on denied
  licenses, and CI keeps the artefacts fresh. The generated files are
  platform-independent: optional bindings resolved per operating system
  (`@esbuild/darwin-arm64`, `fsevents`, …) are excluded, so a macOS checkout and
  the Linux runner produce the same bytes and `git diff --exit-code` is a real
  check rather than a platform comparison.
- Documentation: `docs/DEPLOYMENT.md` (install, certificates, upgrade,
  rollback, backup, hardening), `docs/security/threat-model.md`,
  `privacy.md`, `data-loss.md`, `support-matrix.md` and `verification.md`.
  The user-facing legal documents sit next to them: `docs/TERMS_OF_SERVICE.md`
  and `docs/PRIVACY_POLICY.md`, linked from the README and from the technical
  privacy notice.
- `tooling/scripts/acceptance.mjs` runs the MVP end to end against a live server
  (16 checks), and `docs/TESTING.md` turns it into a manual test plan a person
  can follow screen by screen.
- Structural accessibility tests for the unlock screen and the workspace, plus
  the automated migration, recovery, concurrency and deployment suites.

#### Task `integrate-server-deployment`

- Complete private-network binding, HTTPS setup, session UX, persistent-volume
  setup, health checks, and update/rollback behavior.
- Document Docker Compose deployment on Linux amd64/arm64 and Docker Desktop on
  macOS/Windows.

#### Task `harden-server`

- Run accessibility, performance, migration, security, concurrent-session, and
  recovery test plans.
- Produce the threat model, privacy notice, data-loss warning, and support
  matrix.
- Generate an SBOM, verify third-party licenses, and complete an independent
  cryptographic and key-management review.

#### Task `build-server-release-pipeline`

- Publish reproducible multi-architecture container images and a versioned
  Docker Compose deployment.
- Verify clean installation, upgrade, migration rollback, export, restore, and
  private-network defaults on every supported Docker platform.

**Exit criteria:** the **Flowly Server MVP** passes its acceptance suite and
requires neither Internet access nor any Flowly-operated service for core use.

Met: the acceptance suite is `pnpm verify` plus `pnpm build` (148 tests), the
container runs with no outbound network dependency and no Flowly-operated
service, and the deployment, backup and threat-model documentation ships with
the repository. The independent cryptographic review and the assistive-technology
audit remain open and are listed in `docs/security/verification.md`.

#### Task `align-web-ui-with-mockups`

Status: **complete** (2026-09-11), decision in `docs/adr/0012`.

- Re-token the web client to the Material-style palette the mockups were built
  from: lavender canvas, white borderless cards, tinted panels, soft shadows.
- Give every section a hero header with status facts, actions and an optional
  ribbon of figures, and restyle accounts (endpoint cards with real balances),
  rules (tiles with on/off switches), settings (export/import option cards) and
  the transactions filters (quick tag pills).
- Keep the API surface unchanged: no new endpoint, no new runtime dependency, and
  no figure that the vault cannot compute.

#### Task `restyle-web-ui-for-the-redrawn-mockups`

Status: **complete** (2026-09-16), decision in `docs/adr/0021`.

- Re-token the web client to the redrawn mockups: slate canvas, tinted sidebar,
  white cards with a hairline outline and a 16 px radius, teal primary, pill
  chips, and text colours darkened where the mockup value would miss WCAG AA.
- Move the section title into the shell's top bar next to the vault-state pill,
  the local clock and the session controls; sections now open with a summary card
  instead of repeating their own name.
- Add the dashboard's spending pie chart (one SVG donut per currency) in place of
  the stacked share bar, keep the cash-flow chart, and give Accounts a ribbon of
  booked balances.
- Keep the API surface unchanged: no new endpoint, no new runtime dependency, and
  no figure that the vault cannot compute.

#### Task `polish-web-presentation-rules`

Status: **complete** (2026-09-16), decision in `docs/adr/0022`.

- Format money and rates the Italian way at the presentation boundary
  (`1.234,56`), keep storage, the API and every export canonical, and teach the
  amount fields to read both conventions.
- Right-align the amount column as a column, header included.
- Make **Export data** in the top bar a deep link into the Settings export block,
  and replace the tag colour picker with the token palette plus one free colour
  from the browser's own picker.

#### Task `rebrand-to-the-flowly-lockup`

Status: **complete** (2026-09-18), decision in `docs/adr/0023`.

- Replaced the three-leaf mark with the uploaded Flowly lockup: a white keyhole
  knocked out of a squircle filled with the brand gradient, next to the rounded
  wordmark traced as outlines.
- Re-tokened the interface to the brand palette — deep green `#0b3d2e`, medium
  green `#1e6f4e`, gold `#d4af37` — so primary actions, the sidebar tile, the
  progress bar, the focus halo and the default tag colour are Flowly's own
  colours instead of the mockups' teal.
- Re-cut `logo.svg`, `logo-mark.svg`, `logo-mark-mono.svg`, `favicon.svg` and
  the app icon from the new artwork, with the tile's knockout painted through a
  mask so no seam or halo survives from the trace.

#### Task `paginate-the-ledger`

Status: **complete** (2026-09-20), decision in `docs/adr/0024`.

- The transactions view asks for one window of rows (`limit`/`offset`) and reads
  `total`, instead of rendering the server's default 100 rows and stopping
  there: a vault with more matching movements is no longer silently truncated,
  and the `{total} matching` chip above the table now agrees with what is shown.
- 25 rows per page by default, with a **Rows per page** selector (25/50/100), a
  `Showing 26–50 of 60 transactions` range, a `Page 2 / 3` indicator and
  **Previous**/**Next**. Filter changes and a newly recorded transaction return
  to page 1; a page that empties folds back to the last page that has rows.

#### Task `edit-rules-and-page-the-dashboard`

Status: **complete** (2026-09-20).

- Rules are edited in a dialog: **Edit** on a tile opens the rule's name,
  combinator, conditions and tags over the page, and saving replaces them
  through the existing `PUT /api/tagging-rules/:id`, keeping the id, the
  revision, the on/off state and the rule's place in the order. The **New rule**
  card keeps its own draft and is never reused as the editor; Escape, the X and
  **Cancel** close the dialog without writing, and deleting the rule the dialog
  holds closes it, so the dialog can never save into a record that is gone.
- The dashboard's recent transactions page on the server, ten rows at a time,
  with the window (`Showing 11–20 of 42 transactions`) and **Previous**/**Next**.
  The header chip counts every match, as the ledger's does, and the pager stays
  out of the way when everything fits on one page.
- The dashboard no longer repeats the shell's vault status: the **Local vault
  status** card was showing the vault id, the last unlock and the encryption
  state in the middle of a financial summary. The shell has since dropped its
  own copies of them too (see `keep-the-dashboard-figures-whole`), so no figure
  of the vault's internals competes with the money.

#### Task `interactive-dashboard-charts`

Status: **complete** (2026-09-21).

- The cash-flow chart answers the pointer: the week under it lights up, a
  vertical guide marks it and a tooltip names the dates, income, expenses and
  net, while the other weeks dim. The same information is reachable with the
  keyboard — one tab stop for the chart, then **←**/**→** walk the weeks — and
  clicking a week opens the ledger filtered to that week.
- The spending pie links its two halves: pointing at a slice or a legend row
  thickens that slice, dims the others, highlights the row and replaces the
  period total in the hole with the tag's name, amount, share and currency.
  Clicking either opens the ledger filtered by that tag inside the dashboard's
  period.
- The chart's own summary stays the single `role="img"` a screen reader
  announces; the per-point detail lives in named HTML controls over the drawing
  (the weekly hit layer and the legend rows), never in focusable SVG children.
- `LedgerFilterSeed` carries tag and date filters from a chart into the ledger,
  which opens with them in its filter form. Opening the ledger from the sidebar
  or the dashboard's **See all** clears the seed, so a filtered view is never
  mistaken for the whole ledger.

#### Task `write-rule-amounts-as-decimals`

Status: **complete** (2026-09-22), decision in `docs/adr/0026`.

- An amount condition is `amount`, not `amountMinor`, and its value is a
  canonical decimal string in the condition's own currency: "amount less than
  -5.10 EUR" is written as `{ "field": "amount", "operator": "lessThan",
  "value": "-5.10", "currency": "EUR" }`. The rule now reads like the ledger,
  and the editor accepts decimals instead of whole minor units only.
- The engine still compares exact minor units: both sides go through the
  currency-aware `parseAmountToMinor`, so a rule can never match half a cent,
  "-5.10" and 510 minor units are the same money, and an unsupported currency or
  an amount the currency cannot hold (`-5.105` EUR, `5.5` JPY) is rejected.
- The editor keeps the text that was typed, turns a decimal comma into a dot,
  checks the currency's decimal places and refuses a non-numeric amount before
  calling the API; the edit dialog round-trips the stored value unchanged.
- Tagging rules move to `formatVersion` 2, with the schema, the fixture, the
  generated web contracts and the golden evaluation vectors (which gained a
  decimal case and an exactness case). Rules stored at version 1 are upgraded
  on unlock and on archive import, field and value together, and the rewrite
  bumps each rule's revision like any other write.

#### Task `edit-the-ledger-by-double-click`

Status: **complete** (2026-09-22).

*(The row-editing surface this task introduced became a dialog in
`edit-a-movement-in-a-dialog`; the gesture is unchanged.)*

- A row in the ledger opens for editing on a double-click of an editable cell —
  payee, note, tags or amount — as well as on its **Edit** button, which stays
  as the explicit, keyboard-friendly way in. The editor turns the whole row
  editable in one pass, exactly as the button always did.
- The caret lands in the cell that was double-clicked: the drafted field is
  focused and selected, so a value can be replaced by typing straight away
  instead of being hunted down in the row.
- Double-clicking another cell of the row being edited moves the caret there
  without reloading the row, so a half-typed payee survives a trip through the
  note; **Cancel** returns the row to its read-only cells.
- The table card names the shortcut, so the gesture is discoverable rather than
  hidden.

#### Task `edit-a-movement-in-a-dialog`

Status: **complete** (2026-09-22), decision in `docs/adr/0029`.

- A movement is corrected in a dialog, not in the row: the **Edit** button and a
  double-click on the payee, note, tags or amount cell both open the same form
  the composer uses, prefilled with the account, booking date, amount, payee,
  note, status and tags. **Cancel**, Escape and the X close it without writing,
  and focus returns to the row that opened it.
- The edit keeps the movement's own currency unless the account changes, so a
  USD movement booked on a EUR account is not silently converted; editing still
  never re-runs the tagging rules.
- `TransactionFields` is the shared form behind **Add transaction** and the edit
  dialog, the way `RuleFields` is behind the rule composer and its editor.
- The dialog covers the whole viewport: the backdrop now sits above the sticky
  top bar (it used to slide under it, hiding the dialog's first line) and the
  top padding keeps the title clear of the window edge on short screens.

#### Task `open-the-movement-editor-with-one-click`

Status: **complete** (2026-09-22), decision in `docs/adr/0030`.

- One click on a cell the dialog can change — date, payee, note, tags, amount —
  opens the movement editor; the row's **Edit** button does the same and stays
  the keyboard-reachable way in. The double-click the row editor needed is gone,
  because a dialog no longer changes the cell under the pointer.
- The status chip keeps its own single-click action — booked ↔ pending — and
  never opens the editor; **Raw**, delete and the source chip are unchanged.
- The ledger card's hint reads "click the date, payee, note, tags or amount to
  edit the movement", and the test that covered the double-click now clicks once
  and asserts that the status chip still only toggles.

#### Task `seed-a-demo-vault-and-capture-screenshots`

Status: **complete** (2026-09-22), decision in `docs/adr/0031`.

- `tooling/scripts/seed-demo.mjs` fills a throwaway vault with invented data:
  four accounts (one archived), six tags, five rules (one paused), and about
  three months of movements dated relative to the day it runs, including two
  still-pending rows. It refuses a vault that already holds accounts, so it can
  never write over real data.
- `tooling/scripts/screenshots.mjs` unlocks that vault in a browser session and
  captures the six sections at 1440×900 into `docs/images/`, driving headless
  Chrome over the DevTools protocol with Node's own `WebSocket` — no new
  dependency.
- `README.md` gained a **What it looks like** section with the six images and
  their captions, and `docs/RUNNING.md` holds the full recipe, including how to
  point the scripts at another Chrome and how to stop the scratch server.
- The README images are committed, and the demo data is regenerated rather than
  hand-cropped, so a UI change ends with a `pnpm demo:screenshots` run.

#### Task `drop-the-mobile-target`

Status: **complete** (2026-09-22), decision in `docs/adr/0032`.

- Flowly is desktop-only now: the self-hosted server with its browser UI, plus
  one desktop application for macOS and Windows. The mobile client, the mobile
  platform rows, the app-store distribution and every mobile-derived requirement
  are out of the plan.
- Phases 8-11 keep their published numbers and are named for the desktop
  (foundation, feature parity, hardening and release, Enable Banking for the
  desktop app); their tasks are `desktop-architecture-spike`,
  `scaffold-desktop`, `implement-desktop-*`, `harden-desktop` and
  `build-desktop-release-pipelines`, and the planned client lives in
  `apps/desktop/` with `desktop-packages/` beside it.
- The mobile-shaped requirements are gone with it: phone usage in the runbook,
  mobile permissions and app-switcher privacy, the mobile biometric API and
  backup-exclusion flags, the mobile security checklist (desktop guidance
  replaces it), and the touch icon that existed only for a phone home screen.
- The stack does not change: Flutter + Drift + SQLCipher, the generated Dart
  types from `contracts/`, and Touch ID / Windows Hello as the optional
  biometric shortcuts. The browser UI stays responsive — it is served to
  desktop browsers, not phones.

#### Task `scope-the-dashboard-by-months-and-tags`

Status: **complete** (2026-09-22), decision in `docs/adr/0033`.

- The dashboard's period is a **set of months**, not a range: the picker offers a
  preset (month, 3 months, year, custom), a year strip with the count of that
  year's selected months, the twelve months of the year the strip points at,
  and the selected months as removable chips with **All &lt;year&gt;**,
  **Clear** and the count on that same row.
  `GET /api/dashboard` accepts `months=YYYY-MM,…` and considers exactly those
  months, so a scattered selection never pulls in the months between.
- The chart buckets by month for a month set — one bucket per selected month and
  currency, empty months included — instead of the old fixed week.
- The spending breakdown is a **donut per currency**, one arc per tag of the
  period with the total in the hole. The legend was built as a checkbox filter;
  `keep-the-dashboard-figures-whole` turned it back into a read-out, so the
  dashboard has a single scope.
- Balances stay the account balances — a balance of one tag is not money — and
  income, expenses, net flow, the chart and the recent movements describe every
  tag of the selected months.
- The KPI row, the filter bar, the donut and its legend and the recent table
  follow the redrawn dashboard; the scoping decision is `docs/adr/0033`, and the
  donut's return as the breakdown's shape is `docs/adr/0034`.

#### Task `keep-the-dashboard-figures-whole`

Status: **complete** (2026-09-23), decision in `docs/adr/0035`.

- The dashboard's only scope is its **period**: the months the reader picks stay
  the whole of the filtering, and every figure, the chart, the donut and the
  recent movements describe every category of those months. A tag is no longer
  something to switch off, so `GET /api/dashboard` is called with `months` alone
  and the ledger search behind the recent card carries no `tags` either.
- The spending legend is a **read-out**: colour, name, amount and share per tag,
  with the row itself opening the ledger on that tag. There is no checkbox, no
  **Include all** and no dimmed row — a figure the reader had to reassemble from
  ticks was answering "what if I ignore the rent?" rather than the question the
  page is for.
- The shell lost the chrome that repeated the vault's internals: the top bar's
  **Vault unlocked** pill (`AES-256` badge) and the short vault id are gone, and
  so is the sidebar's **Local vault · Encrypted at rest** card. The top bar
  keeps the section title, the clock and the session controls; what the vault is
  and how it is encrypted stays on the unlock screen and in Settings.
- `GET /api/dashboard` still accepts `tags` for other clients — the endpoint is
  unchanged — but the web client never sends it.

#### Task `restyle-the-rules-page-and-count-what-rules-cover`

Status: **complete** (2026-09-22), decision in `docs/adr/0027`.

- The Rules page follows the redrawn mockup: a violet engine banner with the
  engine's name, a zero-knowledge chip and the evaluated-transaction figure, the
  section headline and its **New rule** shortcut, a two-column body with the
  composer on the left and automation metrics on the right, and a full-width
  registry table of every rule below them.
- The composer is the same condition builder in the new dress: rule name and
  AND/OR logic side by side, numbered condition rows with per-field operators
  and the amount currency, a dashed **Add condition**, tags as toggle pills, and
  a footer with **Reset**, **Simulate on 100 tx** and **Save rule**.
- The overview is measured, not decorative. The engine counts, for every
  transaction in the vault, which stored rules match: **Total matches**, the
  share of the ledger covered, a stacked bar and legend per applied tag, the rule
  count and the engine's on/off state all come from that read.
- **Live evaluation** reads the same count for the unsaved draft, over the most
  recent transactions, shortly after typing stops; a draft the server would
  refuse is never sent, and the explicit **Simulate on 100 tx** button repeats
  the read and reports the errors.
- The registry keeps every action it had (pause, resume, edit, delete, backfill)
  in the new table, adds All/Active filters and an enable/disable-all action, and
  opens a rule's editor from anywhere on its row.

#### Task `give-every-section-the-same-heading`

Status: **complete** (2026-09-22), decision in `docs/adr/0028`.

- The rules page's banner and headline are now the product's page pattern:
  `SectionBanner` (icon tile, eyebrow, title with a state chip, a sentence about
  the section, state chips on the right and a row of figures when the section
  has numbers) and `SectionIntro` (the eyebrow with the section's icon, the
  headline and the section's own action) are shared components, and every
  in-shell page uses them.
- The tones carry meaning rather than decoration: green banners for the money
  itself (dashboard, accounts, ledger), violet for automation (rules, tags),
  slate for the vault (settings).
- The top bar gained the breadcrumb the mockups show above the title, naming the
  family a section belongs to; the vault state pill, the vault id, the clock and
  the session controls are unchanged.
- The ledger follows its own redrawn mockup further: the green banner carries
  this month's income, expenses and net (read from the same dashboard the
  dashboard page reads), the record form moved into a dialog opened by **Add
  transaction**, and the filters, the **View** pills, the table and the pager
  now live in one card.
- Card headers across the pages gained the mockups' uppercase eyebrow above
  their heading (Trend, Movements, Breakdown, Accounts, Setup, Registry, Data in,
  Data out, Security), so every card says what it is at a glance.

#### Task `rewrite-the-readme-as-a-product-overview`

Status: **complete** (2026-09-23), decision in `docs/adr/0036`.

- `README.md` was rewritten from the top: identity and badges, one paragraph of
  what Flowly is, the six screenshots with one-line captions, the features that
  ship, the security model, the quick start, the repository layout, the
  documentation index, the status, contributing and the license. It went from
  about 430 lines of prose to about 200.
- The client-platform table, the milestone table and the "How it's built" essay
  are gone from the front page. ADR 0032 had renamed the mobile material to
  desktop rather than removing it from the README; the platform and phase
  material now lives only in this plan and in its ADRs, which the README links
  to.
- Long paragraphs that restated other documents went with them: the design
  system is `docs/DESIGN.md`, the session mechanics and the screenshot recipe
  are `docs/RUNNING.md`, the deployment and the local CA are
  `docs/DEPLOYMENT.md`. The README describes the shipped product and points at
  the document that owns each detail.
- The `## What it looks like` section, its six images and their synthetic-vault
  note survive ADR 0031; the screenshots themselves are unchanged.

### Phase 6 - Enable Banking for Server

#### Task `design-banking-connector`

Status: **complete** (2026-09-11), decision in `docs/adr/0016`.

- Replaced the prototype with a connector module inside the server
  (`apps/server/src/banking/`).
- Defined the authorization/session flow, callback validation, secret custody in
  the encrypted vault, raw payload retention, retry and rate-limit handling,
  deletion on unlink, and the normalized transaction mapping.
- Kept the delivery contract client-neutral: the banking endpoints return plain
  JSON, so the desktop client can adopt it in Phase 11 without provider secrets.
- Recorded the security boundary, the deduplication rule and the refresh
  behaviour in `docs/PLAN.md` §12 and the threat model in §13.

#### Task `implement-server-banking-import`

Status: **complete** (2026-09-11).

- Implemented the RS256 JWT signing, the Enable Banking client (timeouts,
  bounded retries, pagination), the ASPSP picker, the redirect flow with a
  single-use state, and the session handshake.
- Added `bank_connections`, `bank_links`, `bank_accounts` and `bank_payloads`
  (migration 5), with the settings UI asking for the application id, the `.pem`
  key and the callback URL, and asking per account whether to create or pair a
  Flowly account.
- Sync runs on unlock and on demand from the dashboard, reconciles
  pending-to-booked rows by provider id and fingerprint, applies tagging rules
  before the batch is committed, and never overwrites the user's note or tags.
- Added sanitized sandbox fixtures and 36 connector tests (JWT, normalization,
  API flow, sync, portability, encryption at rest) without logging payloads.

**Exit criteria:** the server can explicitly link, retrieve, normalize, and
import transactions without receiving provider application secrets and without
turning the connector into a synchronization service.

Met: the private key never leaves the server, credentials are only readable while
the vault is unlocked, and the vault stays the canonical ledger.

#### Task `harden-banking-usage`

Status: **complete** (2026-09-14), decisions in `docs/adr/0017` and
`docs/adr/0018`.

- The shell resumes an open vault from its session cookie through
  `GET /api/session`, so reloading a page no longer costs a passphrase and the
  bank callback can complete on its own.
- The bank list became a searchable picker: a country with hundreds of ASPSPs
  never prints them all, and connecting stays an explicit second click.
- The pending authorization survives a reload (the link keeps the provider URL)
  and the panel polls the link status, so an authorization finished in another
  tab is picked up automatically.
- Every balance a person sees for a bank-linked account — dashboard, Accounts,
  totals and the Settings bank card — is the figure Enable Banking reported at
  the last sync (`docs/adr/0019`). A row whose payee only existed in a long
  remittance used to abort the whole sync; the payee is clamped to the field
  limit and a row the vault refuses is reported without losing the rest.
- Every imported row carries a **Raw** view in the ledger: the fields Flowly
  stored next to the ones the bank sent, flattened into tables, matched to the
  stored payload by provider id or by booking date, amount and currency.
- Security audit of the Server MVP (`docs/security/audit-2026-09-15.md`): one
  medium finding (a forged `X-Forwarded-For` could bypass the unlock rate limit
  and spoof the PSU address) and two low ones (cacheable API responses, missing
  `form-action`) fixed with tests; KDF strength, the SQLCipher binding and the
  plain-text export recorded as recommendations and accepted risks.
- Settings compares the saved callback URL with the address the browser is
  using, and lets it be corrected and re-verified without re-uploading the
  private key.
- `GET /enablebanking/auth_callback` is served by the server rather than the
  shell: the single-use state completes the handshake on whatever address the
  bank redirects to, the panel polls for the result, and a refused consent or a
  failed exchange is recorded on the link instead of leaving it pending
  (`docs/adr/0020`).

**Exit criteria:** connecting and reconnecting a bank needs no manual copy of a
URL, and the numbers the product shows agree with the bank once the user asks
them to.

Met: an expired session is the only path back to the passphrase, the bank page
opens in place, and the ledger matches the bank after one alignment.

#### Task `respect-the-bank-access-budget`

Status: **complete** (2026-09-20), decision in `docs/adr/0025`.

- `ASPSP_RATE_LIMIT_EXCEEDED` is the bank's own cap on how many times a consent
  may read an account in a day, not a transient throttle. The client no longer
  retries it, keeps the `Retry-After` the provider sent, and the sync stops at
  the account that hit it instead of spending the next account's budget too.
- The link remembers when it may ask again (`syncBlockedUntil`, starting at six
  hours and doubling per refusal up to 24). Later runs — including the refresh
  on unlock — report the link as blocked without a provider request, and a sync
  that completes clears both the wait and the escalation.
- Refreshing on unlock is now off by default and the connection form no longer
  ticks it, including for a connection stored while it still was the default:
  the first read turns that value off once and marks the record as decided, so a
  user who switches it back on is obeyed from then on. The dashboard says the
  bank is refusing and when Flowly will try again, instead of printing the raw
  ASPSP code.

### Phase 8 - Desktop application foundation

#### Task `desktop-architecture-spike`

- Prove Flutter + Drift + SQLCipher create/open/migrate/release builds on macOS
  and Windows.
- Prove secure storage, `local_auth`, passphrase-derived key wrapping, and
  encrypted portable-archive compatibility with the server.
- Record plugin maintenance, licenses, binary size, and platform failure modes.

#### Task `scaffold-desktop`

- Scaffold the Flutter application and Dart packages after server contracts are
  stable.
- Generate Dart types and validators from the canonical contracts.
- Port the domain rules and run them against the existing golden fixtures.

#### Task `implement-desktop-vault-storage`

- Implement desktop vault creation, passphrase lifecycle, optional biometric
  unlock, auto-lock, deletion, Drift/SQLCipher storage, and migrations.
- Add backup exclusions, restrictive filesystem handling, and storage contract
  tests.

**Exit criteria:** both desktop targets open the canonical fixture vault, fail
closed on tampering, and match the server domain and crypto vectors.

### Phase 9 - Desktop feature parity

#### Task `implement-desktop-core-finance`

- Implement accounts, transactions, tags, notes, validation, and adaptive
  navigation in Flutter.
- Implement tagging-rule CRUD, the rule engine, and backfill in Flutter,
  validated against the shared rule-evaluation fixtures.

#### Task `implement-desktop-csv-transfer`

- Implement transaction CSV merge and complete portable archive export/import.
- Verify bidirectional server/desktop round trips and replace-only complete
  imports.

#### Task `implement-desktop-analysis`

- Implement dashboard, search, recurrence, and multi-currency rules.
- Run the shared acceptance fixtures against Dart and TypeScript.

**Exit criteria:** desktop results and portable exports conform to the released
server contracts on macOS and Windows.

### Phase 10 - Desktop hardening and release

#### Task `harden-desktop`

- Complete platform permissions, biometric UX, window preview privacy, file
  dialogs, keyboard behaviour, accessibility, performance, and recovery tests.
- Complete the OWASP MASVS desktop checks and the platform support
  documentation.

#### Task `build-desktop-release-pipelines`

- Create reproducible, signed macOS and Windows builds.
- Verify installers, updates, migrations, and portable export compatibility on
  both targets.

**Exit criteria:** the signed desktop releases pass the cross-platform
acceptance suite and remain independent vaults with no automatic server
synchronization.

### Phase 11 - Enable Banking for the desktop application

#### Task `implement-desktop-banking-import`

- Integrate the macOS and Windows clients with the connector contracts released
  in Phase 6.
- Implement platform authorization callbacks, one-time batch delivery,
  reconciliation, and idempotent import into each local desktop vault.
- Run the same sanitized provider fixtures and deduplication expectations used
  by the server.
- Apply tagging rules to imported transactions and verify parity with server
  results.

**Exit criteria:** both desktop targets can explicitly import from Enable
Banking without receiving provider application secrets, synchronizing with
another vault, or changing server-side normalization semantics.

### Phase 12 - Automatic encrypted backups

#### Task `implement-automatic-backups`

- Add opt-in backup scheduling for self-hosted server vaults.
- Encrypt every backup before it leaves the service process.
- Add retention, rotation, restore verification, destination health, and
  failure notifications.
- Support user-controlled local or remote destinations without introducing a
  Flowly-operated cloud dependency.

**Exit criteria:** scheduled backups can be restored on a clean supported
deployment, failures are visible, and retention never deletes the last verified
recovery point.

## 18. Task Dependencies

| Task | Depends on |
|---|---|
| `scaffold-server` | `server-architecture-spike` |
| `define-contracts-and-server-domain` | `server-architecture-spike` |
| `implement-server-vault` | `scaffold-server`, `define-contracts-and-server-domain` |
| `implement-server-storage` | `implement-server-vault` |
| `implement-server-core-finance` | `implement-server-storage` |
| `implement-server-auto-tagging` | `implement-server-core-finance` |
| `implement-server-csv-transfer` | `implement-server-auto-tagging` |
| `implement-server-dashboard-search` | `implement-server-core-finance` |
| `integrate-server-deployment` | `implement-server-csv-transfer`, `implement-server-dashboard-search` |
| `harden-server` | `integrate-server-deployment` |
| `build-server-release-pipeline` | `integrate-server-deployment`, `harden-server` |
| `design-banking-connector` | `build-server-release-pipeline` |
| `implement-server-banking-import` | `design-banking-connector` |
| `desktop-architecture-spike` | `implement-server-banking-import`, `build-server-release-pipeline` |
| `scaffold-desktop` | `desktop-architecture-spike`, `define-contracts-and-server-domain` |
| `implement-desktop-vault-storage` | `scaffold-desktop` |
| `implement-desktop-core-finance` | `implement-desktop-vault-storage` |
| `implement-desktop-csv-transfer` | `implement-desktop-core-finance` |
| `implement-desktop-analysis` | `implement-desktop-core-finance` |
| `harden-desktop` | `implement-desktop-csv-transfer`, `implement-desktop-analysis` |
| `build-desktop-release-pipelines` | `harden-desktop` |
| `implement-desktop-banking-import` | `implement-server-banking-import`, `build-desktop-release-pipelines` |
| `implement-automatic-backups` | `build-server-release-pipeline`, `implement-desktop-banking-import` |

Server phases are sequential release gates. After the Server MVP, Enable Banking
for Server (Phase 6) is delivered first, before the desktop application
foundation (Phase 8) may begin. Desktop feature work cannot move ahead of its
foundation and conformance gates.

## 19. Definition of Done for the Server MVP

The first MVP is complete at the end of Phase 5 only when:

- Users can deploy with Docker Compose on every supported host platform.
- A single owner can create and unlock one encrypted server vault shared by
  concurrent browser sessions on a private network.
- Accounts, transactions, notes, tags, search, and dashboards work without
  Internet access.
- Tagging rules apply to new and imported transactions, backfill is idempotent,
  and rules round-trip in the complete portable export.
- Multi-currency values are represented without floating-point errors or
  misleading aggregation.
- Manual transaction CSV and password-encrypted complete portable exports work.
- Invalid imports fail visibly and atomically; complete portable imports always
  replace the destination vault after explicit confirmation.
- Concurrent edits cannot silently overwrite newer data.
- No shipped artifact contains provider keys, test secrets, or sensitive
  fixture data.
- Locked storage, journals, caches, logs, and crash reports contain no plaintext
  financial records; request logs strip query strings and the proxy omits the
  bank callback.
- Accessibility, security, migration, recovery, and server release checks pass.
- The product clearly explains that there is no synchronization and no
  passphrase recovery service.

## 20. Explicitly Out of Scope

- Flowly cloud account or username/password authentication
- Automatic cross-device synchronization
- Shared household vaults
- Flowly-operated or Internet-hosted canonical transaction storage
- Direct exposure of the server to the public Internet
- Multi-user or role-based access to a server vault
- Browser-side offline vaults or installable PWA behavior
- Automatic or scheduled backups in the MVP
- The desktop application in the Server MVP
- Automatic exchange-rate retrieval
- Investment portfolio pricing
- Receipt/image attachment storage
- Payment initiation
- Enable Banking integration in the Server MVP (it ships as Phase 6, after the
  MVP release gate)
- Bank account linking for the desktop client (Phase 11)
- Nested boolean condition groups, tag-removal actions, rule-driven edits to
  payee or note, rule re-evaluation when a transaction is edited, and background
  rule scheduling in the Server MVP

## 21. Key Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Encrypted SQLite wrapper incompatibility across Docker platforms | Mandatory Phase 0 proof-of-concept, multi-arch images, and authenticated record-encryption fallback |
| The self-hosted server is unavailable or its storage fails | Manual encrypted exports in the MVP, migration snapshots, visible health status, and automatic backups in Phase 12 |
| Local HTTPS setup is difficult | Versioned reverse-proxy configuration, guided local certificate enrollment, and an explicit supported-browser matrix |
| Docker behavior differs across Linux and Docker Desktop | CI smoke tests on every supported host and conservative persistent-volume documentation |
| React and Flutter behavior diverges after Phase 8 | Canonical schemas, generated models, shared design tokens, golden vectors, and conformance gates |
| Product behavior drifts between TypeScript and Dart | Cross-client conformance CI blocks releases when canonical outputs differ |
| CSV is plaintext and easy to leak | Clear warning, streaming generation, encrypted archive recommended |
| Importing between unsynchronized devices creates duplicates | Stable IDs, provider IDs, fingerprints, preview, explicit conflict policy |
| Biometric APIs vary | Capability detection and passphrase fallback |
| Multi-currency summaries can mislead | Never aggregate unlike currencies without explicit conversion data |
| Recurrence calendar edge cases | Calendar-aware library plus property and time-zone tests |
| Tagging rules label transactions unexpectedly | Live match preview, per-rule pause, rule-applied tags labeled in import previews, and explicit backfill instead of silent retroactive changes |
| Rule evaluation slows large imports | In-memory evaluation over the imported batch, bounded condition counts per rule, and import performance fixtures |
| Provider credentials leak from clients | Server-side connector with the key in the encrypted vault, a public-key fingerprint in the API, and a build-time frontend secret scan |
| A bank changes or withdraws its consent | Stored consent validity, a session status check before every sync, and an `expired` link state that asks for reconnection |
| A consent runs out of the reads a bank grants per day | Refresh on unlock off by default, one sync at a time, a run that stops at the first refusal, and a widening wait on the link before Flowly asks again |
| Provider data and the local ledger drift apart | Provider ids plus versioned fingerprints, a seven-day reconciliation overlap, and raw payloads kept per account |
| Existing prototype encourages unsafe patterns | Retired from the build and the tests; replaced by `apps/server/src/banking/` |

## 22. Reference Material

- React: <https://react.dev/>
- Flutter: <https://docs.flutter.dev/>
- Flutter desktop support: <https://docs.flutter.dev/platform-integration/desktop>
- Drift: <https://drift.simonbinder.eu/>
- Drift encryption guidance:
  <https://drift.simonbinder.eu/platforms/encryption/>
- Dart package `local_auth`: <https://pub.dev/packages/local_auth>
- Dart package `flutter_secure_storage`:
  <https://pub.dev/packages/flutter_secure_storage>
- JSON Schema: <https://json-schema.org/>
- Tauri 2: <https://v2.tauri.app/>
- Docker Compose: <https://docs.docker.com/compose/>
- SQLCipher: <https://www.zetetic.net/sqlcipher/>
- `@journeyapps/sqlcipher`: <https://www.npmjs.com/package/@journeyapps/sqlcipher>
- `@node-rs/argon2`: <https://www.npmjs.com/package/@node-rs/argon2>
- Node.js SQLite (`node:sqlite`): <https://nodejs.org/api/sqlite.html>
- Node.js native TypeScript type stripping:
  <https://nodejs.org/api/typescript.html>
- OWASP Application Security Verification Standard:
  <https://owasp.org/www-project-application-security-verification-standard/>
- OWASP MASVS desktop and platform guidance: <https://mas.owasp.org/>
- Argon2 specification, RFC 9106: <https://www.rfc-editor.org/rfc/rfc9106>
- Apple Keychain Services:
  <https://developer.apple.com/documentation/security/keychain_services>
- Windows Data Protection API:
  <https://learn.microsoft.com/windows/win32/secauthn/data-protection>
- Flutter desktop support: <https://docs.flutter.dev/platform-integration/desktop>
- OWASP Session Management Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>
- Enable Banking API reference:
  <https://enablebanking.com/docs/api/reference/>
- Enable Banking quick start and JWT format:
  <https://enablebanking.com/docs/api/quick-start/>
- Enable Banking sandbox guide: <https://enablebanking.com/docs/api/sandbox/>
- Enable Banking OpenAPI description:
  <https://enablebanking.com/docs/api/reference/enablebanking-api.yaml>
