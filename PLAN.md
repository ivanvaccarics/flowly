# Flowly - Architecture, Security, Requirements, and Implementation Plan

## 1. Purpose

Flowly is a local-first personal finance application delivered first as a
self-hosted server and web UI. Later phases add installed applications for:

- iOS
- Android
- macOS
- Windows

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
- Budgets
- Full data export and import
- Server-side passphrase protection and secure browser sessions

Recurring transactions are the next post-MVP feature: they are delivered in
Phase 7, after Enable Banking for Server (Phase 6) and before Flutter work
begins.

Flutter applications, native encrypted storage, and biometric unlock are
post-Server-MVP deliverables in Phases 8-10.

Username/password accounts, Flowly-operated cloud services, and cross-device
synchronization are explicitly out of scope.

## 2. Current Repository Assessment

The repository is an early prototype rather than an application:

- `README.md` describes the intended product and roadmap but no application has
  been implemented yet.
- `spikes/server-architecture/` holds the completed Phase 0 proof-of-concepts:
  encrypted vault storage, vault lifecycle, migrations, failure behaviour,
  portability and HTTPS sessions, with a measured report and multi-architecture
  container checks. It is throwaway code and stays outside the production
  workspace.
- `.python-version` selects Python 3.14.
- `enable_banking.py` is a standalone Enable Banking exploration script.
- There is no production dependency manifest, application structure, CI
  configuration, or release configuration yet; Phase 1 creates them. The only
  test suite is the Phase 0 spike suite.
- Local `data/`, `secrets/`, `.venv/`, and `node_modules/` paths are ignored.
- The prototype reads an RSA private key from `secrets/`, creates a JWT, prints
  that JWT, and performs an interactive authorization flow. Printing tokens and
  keeping provider signing logic in a distributable client must not be carried
  into production.
- Local SQLite and JSON files exist under the ignored `data/` directory. Their
  financial contents are not required for architecture planning and should be
  treated as sensitive local data.

The prototype should be retained only as a reference until the future banking
connector is implemented, then either removed or moved under an explicitly
non-production `prototypes/` directory after its secret and token handling is
hardened.

## 3. Confirmed Product Decisions

| Decision | Selected direction |
|---|---|
| First release | Self-hosted Server MVP at the end of Phase 5 |
| Later mobile targets | iOS and Android |
| Later desktop targets | macOS and Windows |
| Browser target | React web UI served by a self-hosted service on a private network |
| Server distribution | Docker Compose on Linux amd64/arm64 and Docker Desktop on macOS/Windows |
| Native distribution | App stores for mobile; direct signed downloads for desktop |
| Account meaning | Financial account, not a Flowly user identity |
| Unlock | Server passphrase and secure session; native passphrase plus optional biometrics from Phase 8 |
| Device relationship | Installed apps own independent vaults; browser sessions share their server vault |
| Data transfer | Explicit export/import performed by the user |
| Web ownership | Single owner, one vault, multiple concurrent browser sessions |
| Web deployment | Persistent Docker volume and private-network HTTPS; no direct Internet exposure |
| Access boundary | Private LAN or user-managed VPN only |
| Server storage engine | SQLCipher 4 through `@journeyapps/sqlcipher`, with `node:sqlite` plus AES-256-GCM record encryption as the documented fallback |
| Delivery order | Release the server, then Enable Banking for Server, then recurring transactions, then Flutter |
| Future bank integration | A separate trusted backend/connector is allowed |
| Additional MVP scope | Dashboard, advanced search, multi-currency, budgets, manual tagging rules |
| Auto-tagging rules | Server MVP, Phase 3: one AND/OR condition group over note, description, payee, amount, or account, adding one or more tags; tags are only added, provenance is not tracked, and editing a transaction does not re-run rules |
| Next feature after the MVP | Recurring transactions in Phase 7, delivered after Enable Banking for Server and before Flutter |

## 4. Architecture Options Considered

| Option | Advantages | Disadvantages | Decision |
|---|---|---|---|
| Flutter for every client | One Dart UI codebase; mature mobile and desktop support; web target available | Does not provide the desired central self-hosted vault and multi-PC browser access without adding a server anyway | Not selected |
| Tauri 2 for desktop and mobile plus web | Small binaries; Rust security boundary; high code sharing | Mobile ecosystem and security/database plugins are newer; increases risk for biometric and encrypted database support | Reserve as a future simplification option |
| React UI + self-hosted TypeScript service + Flutter installed clients | One server vault is shared safely by multiple PCs; browser storage is not a source of truth; Flutter retains mature native storage and biometrics | Requires private-network HTTPS, server sessions, concurrency handling, multi-architecture packaging, and an available host | **Recommended** |
| Encrypted browser PWA + self-hosted file storage | The host never handles plaintext domain data | Each browser still owns a divergent vault; conflict resolution, querying, and multi-PC consistency become substantially more complex | Rejected |
| React/TypeScript + Capacitor mobile + Tauri desktop + local service | High TypeScript sharing | Two native shells; mobile Tauri is newer; native security and biometric integrations carry more risk | Valid fallback if minimizing duplicate product code becomes the primary constraint |
| Fully separate native applications | Maximum platform-specific control | Excessive duplication across five targets | Rejected |

### Recommendation

Use a polyglot monorepo with two application implementations:

- **Self-hosted web:** a React and TypeScript frontend plus a TypeScript service
  deployed together with Docker Compose. The service owns the encrypted vault,
  domain operations, sessions, and import/export. Browsers are presentation
  clients and persist no financial records.
- **Installed application:** one Flutter/Dart codebase compiled for iOS,
  Android, macOS, and Windows.
- **Future connector:** a separate TypeScript service that owns Enable Banking
  credentials and API sessions.

Delivery is intentionally sequential: implement and release the TypeScript
server first, then use its stable contracts and golden fixtures to implement
Flutter. Do not scaffold or implement Flutter during Server MVP phases 0-5.

This hybrid approach is preferable when a single self-hosted private-network vault,
encrypted SQLite, native platform maturity, biometric integration, and
consistent installed-app behavior are more important than maximum source-code
sharing. It also avoids forcing a browser-oriented shell onto mobile and
desktop.

The trade-off must be accepted explicitly: the TypeScript service and Flutter
will have separate application/domain implementations, while React remains a
thin client of the service. TypeScript and Dart share specifications rather
than runtime libraries. Product parity is enforced through:

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
    web/                         # React/TypeScript browser UI; no vault storage
      src/
        ui/
    server/                      # Self-hosted API, domain, sessions, storage
      src/
        domain/
        application/
        infrastructure/
    native/                      # Flutter app for iOS/Android/macOS/Windows
      lib/
        domain/
        application/
        infrastructure/
        presentation/
    banking-connector/           # Future TypeScript Enable Banking service
  spikes/
    server-architecture/         # Throwaway Phase 0 proof-of-concepts, retired after Phase 1
  contracts/
    schemas/                     # Canonical JSON Schema definitions
    csv/                         # CSV/archive schemas and version documentation
    fixtures/                    # Sanitized cross-client golden fixtures
    expected-results/            # Canonical calculations and deduplication outcomes
  packages/
    web-contracts/               # Generated TS types and runtime validators
    web-test-support/            # React/TS conformance helpers
  native-packages/
    flowly_contracts/            # Generated Dart models and validators
    flowly_test_support/         # Flutter/Dart conformance helpers
  tooling/
    scripts/                     # Language-neutral orchestration and schema generation
    eslint/
    typescript/
  docs/
    adr/
    security/
  deployment/
    self-hosted/                 # Docker Compose, HTTPS proxy, multi-arch packaging
  prototypes/
    enable-banking/              # Temporary, sanitized prototype only
```

Use `pnpm` workspaces for the React client, generated TypeScript packages, and
future connector. Use the Flutter SDK and Dart packages for the native client.
Root scripts must provide one command surface for format, lint, test, contract
generation, and cross-client conformance. Add a Flutter monorepo tool such as
Melos only if multiple Dart packages make it worthwhile.

## 6. Architectural Boundaries

### 6.1 Shared contracts

`contracts/` is the language-neutral source of truth for:

- Persisted entity shapes
- Enumerations and identifiers
- CSV/archive versions
- Validation examples
- Import deduplication fixtures
- Money, budget, recurrence, and dashboard expected results
- Cryptographic envelope metadata and known-answer vectors

Breaking contract changes require a new schema/export version and migrations in
the server and native application. Generated types do not replace runtime
validation or domain invariants.

### 6.2 Domain and application layers

Implement the same clean boundaries independently in the TypeScript service and
the Dart application:

- The server domain imports no React, HTTP framework, SQL, filesystem, or
  network APIs.
- The native domain imports no Flutter widgets, SQL, platform channels, or
  network APIs.
- Application services depend on repositories and platform-service interfaces.
- React and Flutter UI code never query storage directly.

The server and native implementations own the same behavior:

- Financial account lifecycle
- Money and currency invariants
- Transaction validation
- Tags
- Tagging rule evaluation
- Budgets and budget consumption
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
- `BudgetRepository`
- `RecurringRuleRepository`
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
- Native plugins must be wrapped behind application-owned interfaces so plugin
  changes do not leak into domain or presentation code.

### 6.5 User interfaces

The two UIs follow one product design specification but are implemented with
their platform-native toolkit:

- React provides a responsive LAN web interface with browser accessibility
  semantics.
- Flutter provides adaptive mobile and desktop layouts from one Dart widget
  codebase.
- Mobile uses bottom navigation where appropriate.
- Desktop and wide web layouts use a sidebar or navigation rail.
- Both support keyboard navigation on desktop-class devices.
- WCAG 2.2 AA target for the web UI
- Flutter semantics and platform accessibility checks for installed clients
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
- `source`: manual, CSV import, recurring rule, or Enable Banking
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
- `recurringRuleId`

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
- `amountMinor greater than`, `less than`, `equals` — signed minor units, where
  inflows are positive and outflows are negative; each amount condition carries
  a currency and matches only transactions in that currency, with no implicit
  conversion
- `accountId is` — exact account identifier

A rule joins its conditions with a single AND or OR. Nested groups are out of
scope for the MVP. Every rule that matches applies its tags, and the resulting
tags are a set, so evaluation is order-independent.

A rule holds at most 25 conditions and assigns at most 25 tags; the API and the
editor enforce both limits.

Rules run when a transaction is created manually, merged from CSV, imported
from Enable Banking (Phase 6), or generated from a recurring rule (Phase 7).
Editing an existing transaction does not re-run rules. An explicit backfill
action applies rules to existing transactions and is idempotent.

Rules only add tags. They never remove tags or modify other fields, and Flowly
does not track which rule added which tag: editing or deleting a rule leaves
previously applied tags in place.

### 7.5 Budgets

- `id`
- `name`
- `amountMinor`
- `currency`
- `period`: weekly, monthly, quarterly, yearly, or custom
- `startDate`
- Optional account and tag filters
- Rollover policy, defaulting to disabled
- Active/archived state

Budget totals include booked outflows by default. Pending transactions and
transfers are independently configurable.

### 7.6 Recurring rules

Delivered in Phase 7, after Enable Banking for Server and before Flutter. The
Server MVP ships without recurring rules.

- `id`
- Template account, amount, currency, payee, note, and tags
- Frequency and interval
- Start date and optional end date
- Next due date
- Active/paused state
- Generation policy

Generation produces local transaction occurrences when the app is opened. It
does not require a background cloud scheduler.

### 7.7 Operational metadata

Persist:

- Schema version
- Vault format version
- Import history
- Export format version
- Migration history
- User preferences

Never place passphrases, unwrapped keys, Enable Banking private keys, access
tokens, or complete sensitive payloads in logs or telemetry.

## 8. Local Storage Strategy

### 8.1 Native mobile and desktop

Use Flutter with Drift over SQLite and a SQLCipher-compatible native library.
The current leading candidate is `sqlcipher_flutter_libs` with `sqlite3`/Drift,
but it is not accepted until the architecture spike proves installation,
encryption, migrations, release builds, and licensing on iOS, Android, macOS,
and Windows.

Required behavior:

- WAL/journal files and temporary files are encrypted or configured so they
  never contain plaintext.
- Foreign keys are enabled.
- Migrations are transactional and forward-only.
- Database backups are not copied to cloud backup locations unless explicitly
  approved and encrypted.
- Mobile backup exclusion flags are configured where available.
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
equivalent suites in TypeScript and Dart against the server and native storage
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

- iOS/macOS: Keychain protected by the system biometric policy
- Android: Keystore key gated by `BiometricPrompt`
- Windows: DPAPI and, where practical, Windows Hello-backed protection
- Self-hosted web: passphrase unlock only in the MVP; WebAuthn convenience
  unlock is deferred

The platform store contains only a device-bound wrapping key or wrapped DEK,
never the user's passphrase.

### 9.3 Lock behavior

- Lock on explicit user action.
- Auto-lock after a configurable inactivity interval.
- Lock when the app is backgrounded beyond a short grace period.
- Clear decrypted caches and sensitive form state on lock.
- Prevent sensitive screenshots/app-switcher previews where supported.
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

Provide two workflows:

1. **Transaction CSV:** one human-readable RFC 4180-compatible CSV for analysis
   in spreadsheet tools.
2. **Complete portable export:** a password-encrypted, versioned archive
   containing CSV files for accounts, transactions, tags, transaction-tag
   links, tagging rules, budgets, and preferences, plus a small manifest
   containing format and checksum metadata.

The complete export is the supported device-to-device transfer format. The
archive contents remain CSV-oriented while preserving normalized relationships.
Tagging rules are part of format version 1 because they ship in the Server MVP.
Recurring rules join the archive in Phase 7 through a versioned format bump that
keeps the previous version importable.

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

## 11. Dashboard, Search, Multi-Currency, Budgets, Recurrence, and Tagging Rules

### 11.1 Dashboard

The initial dashboard includes:

- Balance by account
- Net cash flow for a selected period
- Income and expense totals
- Spending by tag
- Budget consumption
- Upcoming recurring transactions (added with the recurring phase, Phase 7)

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

Search semantics must match across native and server adapters.

### 11.3 Multi-currency

The MVP:

- Preserves each transaction's original currency.
- Calculates per-currency totals without inventing conversions.
- Does not combine balances from different currencies into one number unless an
  explicit exchange-rate source and valuation date are available.
- Allows manually entered original and converted amounts.

Automatic foreign-exchange rate retrieval is out of scope.

### 11.4 Budgets

Budgets are denominated in one currency. Transactions in another currency are
excluded unless they contain an explicit converted amount in the budget
currency.

### 11.5 Recurrence

Delivered in Phase 7, after Enable Banking for Server and before Flutter.

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
Flutter. Neither step introduces synchronization between vaults.

### 12.1 Security boundary

Enable Banking application private keys and JWT signing must never ship in the
web, mobile, or desktop clients. Reverse engineering a distributed client would
expose those credentials.

Create a separate connector service that:

- Stores the application private key in a managed secret store or HSM-backed
  service.
- Generates short-lived signed JWTs.
- Owns registered redirect URLs and callback validation.
- Uses cryptographically random, single-use OAuth state values.
- Stores provider sessions/tokens encrypted with strict retention limits.
- Calls Enable Banking APIs and normalizes responses into a provider-neutral
  transaction schema.
- Provides one-time or short-lived delivery of imported batches to an unlocked
  client.
- Maintains audit events without logging financial payloads or secrets.

### 12.2 Preserve the no-sync product rule

The connector is an ingestion channel, not the canonical database:

- The server vault links and imports independently in Phase 6.
- Each native vault links and imports independently in Phase 11.
- The destination encrypted vault remains the source of truth.
- The connector does not provide cross-device synchronization.
- Provider data is deleted after delivery or after a short documented retry
  window.
- User notes and tags remain local and are never overwritten by provider
  refreshes.
- Tagging rules run on the imported batch, so imported transactions land with
  their tags in one atomic write.

### 12.3 Provider deduplication

Prefer provider transaction IDs. Where institutions do not provide stable IDs,
use a versioned fingerprint and retain provider raw identifiers needed for
reconciliation. Pending-to-booked transitions must update an existing
transaction rather than create a duplicate when a reliable match exists.

### 12.4 Prototype disposition

Before reusing any logic from `enable_banking.py`:

- Remove JWT and session payload printing.
- Add explicit request timeouts and typed error handling.
- Move credentials to a server-side secret provider.
- Validate callback state and redirect data.
- Add pagination, retries with bounded backoff, rate-limit handling, and
  idempotency.
- Add sanitized fixtures and contract tests.
- Do not use real transaction files as committed test fixtures.

## 13. Security Requirements and Threat Model

### 13.1 Assets

- Financial transactions and balances
- User notes and tags
- Vault encryption keys
- Passphrase-derived material
- Export files
- Future bank session tokens and signing keys

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
| Enable Banking key extraction | Server-only key custody; never distribute provider private keys |

### 13.3 Application security controls

- Validate all data at trust boundaries with runtime schemas.
- Use parameterized SQL exclusively.
- Request the minimum Flutter platform permissions and audit every native
  plugin and platform channel.
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
- Native applications have no network dependency for core usage. The web UI
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

- TypeScript domain and property-based tests for money, budgets, deduplication,
  and CSV round trips during Server MVP development
- Server storage contract, migration, crypto known-answer, and tamper tests
- React component and accessibility tests
- Tagging rule contract, normalization, AND/OR, amount-currency, account,
  import-preview, and idempotent backfill tests in Phase 3, with golden
  rule-evaluation vectors shared with Dart
- Migration tests from every released schema
- Multi-architecture container, HTTPS, session, restart, concurrent-edit, and
  update tests on Linux amd64/arm64 and Docker Desktop on macOS/Windows
- End-to-end workflows for create, lock-current, lock-all, unlock, CSV merge,
  complete-vault replace, export, and delete
- Connector contract tests using sanitized Enable Banking fixtures in Phase 6
- Recurring rule contract, property, end-of-month, and time-zone tests in
  Phase 7
- Equivalent Dart domain, property-based, storage, crypto, component, and
  accessibility tests beginning in Phase 8
- Cross-language golden-vector and portable-archive conformance tests in Phases
  8-11
- Platform smoke tests on iOS, Android, macOS, and Windows beginning in Phase 8

### Security verification

- Static analysis for TypeScript in Server MVP phases and Dart from Phase 8
- Dependency and license scanning
- Secret scanning
- Mobile checks aligned with OWASP MASVS from Phase 8
- Web checks aligned with OWASP ASVS
- Threat-model review before beta
- Independent review of key management and export handling before production

## 17. Delivery Plan and Tasks

Phases 0-5 are strictly server-first. They deliver the first releasable product,
the **Flowly Server MVP**. After that release gate, Phase 6 adds Enable Banking
for Server, Phase 7 adds recurring transactions as the next feature, and only
then does Flutter work begin in Phase 8.

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
  budget, and recurrence models and invariants.
- Define server repository and platform-service interfaces.
- Add golden expected results, including tagging-rule evaluation vectors, that
  the later Dart implementation must consume unchanged.

**Exit criteria:** the TypeScript domain suite runs without UI or infrastructure
dependencies, and the React UI renders a locked-vault shell from the server API.

### Phase 2 - Server vault and persistence

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

### Phase 3 - Server core finance and portability

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

### Phase 4 - Server analysis and budgeting features

#### Task `implement-server-dashboard-search`

- Add dashboard summaries, date ranges, account/tag filters, and text search.
- Add performance indexes and caches without weakening encryption boundaries.

#### Task `implement-server-budgets`

- Implement budget periods, filters, and consumption.
- Add multi-currency exclusion and explicit-conversion rules.

**Exit criteria:** calculations are deterministic across locale and time zone,
and the reference data set remains interactive on supported hosts.

### Phase 5 - Server hardening and release

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

### Phase 6 - Enable Banking for Server

#### Task `design-banking-connector`

- Replace the prototype with a separate connector architecture.
- Define OAuth/session, callback, secret custody, retention, delivery, retry,
  audit, deletion, and normalized transaction contracts.
- Keep delivery contracts client-neutral so Flutter can adopt them in Phase 11.
- Complete a dedicated threat model and privacy assessment.

#### Task `implement-server-banking-import`

- Implement the connector, provider adapter, server authorization flow,
  one-time delivery, pending-to-booked reconciliation, and idempotent import.
- Apply tagging rules to imported transactions before the batch is committed.
- Add sandbox integration tests and operational monitoring without sensitive
  payload logging.

**Exit criteria:** the server can explicitly link, retrieve, normalize, and
import transactions without receiving provider application secrets and without
turning the connector into a synchronization service.

### Phase 7 - Recurring transactions (next feature)

The next feature after Enable Banking for Server, delivered before Flutter work
begins. The Server MVP ships without recurring rules, so this phase owns their
contracts, storage, generation, UI, and portability.

#### Task `define-recurring-contracts`

- Add canonical recurrence schemas, rule shapes, generation policies, and
  expected-result fixtures to `contracts/`.
- Extend the portable archive with a new version that carries recurring rules
  while remaining able to import the previous version.
- Define `RecurringRuleRepository` and clock-driven occurrence-generation
  interfaces.

#### Task `implement-server-recurring`

- Implement recurring rule CRUD in the server API and the React UI, including
  pause and resume.
- Implement calendar-aware occurrence generation when the app is opened, with
  deterministic next-due handling and no background server scheduler.
- Add the upcoming-recurring panel to the dashboard and the multi-currency
  exclusion and explicit-conversion rules for generated occurrences.
- Apply tagging rules to generated occurrences.
- Add property, end-of-month, time-zone, and archive round-trip tests against
  the shared fixtures.

**Exit criteria:** occurrences are generated deterministically across locale and
time zone, paused rules stop generating, the new archive version round-trips and
imports the previous one, and no recurring work requires a cloud scheduler.

### Phase 8 - Flutter foundation

#### Task `native-architecture-spike`

- Prove Flutter + Drift + SQLCipher create/open/migrate/release builds on iOS,
  Android, macOS, and Windows.
- Prove secure storage, `local_auth`, passphrase-derived key wrapping, and
  encrypted portable-archive compatibility with the server.
- Record plugin maintenance, licenses, binary size, and platform failure modes.

#### Task `scaffold-native`

- Scaffold the Flutter application and Dart packages after server contracts are
  stable.
- Generate Dart types and validators from the canonical contracts.
- Port the domain rules and run them against the existing golden fixtures.

#### Task `implement-native-vault-storage`

- Implement native vault creation, passphrase lifecycle, optional biometric
  unlock, auto-lock, deletion, Drift/SQLCipher storage, and migrations.
- Add backup exclusions, restrictive filesystem handling, and storage contract
  tests.

**Exit criteria:** every native target opens the canonical fixture vault, fails
closed on tampering, and matches the server domain and crypto vectors.

### Phase 9 - Flutter feature parity

#### Task `implement-native-core-finance`

- Implement accounts, transactions, tags, notes, validation, and adaptive
  navigation in Flutter.
- Implement tagging-rule CRUD, the rule engine, and backfill in Flutter,
  validated against the shared rule-evaluation fixtures.

#### Task `implement-native-csv-transfer`

- Implement transaction CSV merge and complete portable archive export/import.
- Verify bidirectional server/native round trips and replace-only complete
  imports.

#### Task `implement-native-analysis`

- Implement dashboard, search, budgets, recurrence, and multi-currency rules.
- Run the shared acceptance fixtures against Dart and TypeScript.

**Exit criteria:** native results and portable exports conform to the released
server contracts on iOS, Android, macOS, and Windows.

### Phase 10 - Native hardening and release

#### Task `harden-native`

- Complete mobile permissions, biometric UX, app-switcher privacy, desktop file
  dialogs, keyboard behavior, accessibility, performance, and recovery tests.
- Complete OWASP MASVS checks and platform support documentation.

#### Task `build-native-release-pipelines`

- Create reproducible, signed mobile and desktop builds.
- Verify installers, store packages, updates, migrations, and portable export
  compatibility on every native target.

**Exit criteria:** signed native releases pass the cross-platform acceptance
suite and remain independent vaults with no automatic server synchronization.

### Phase 11 - Enable Banking for Flutter

#### Task `implement-native-banking-import`

- Integrate iOS, Android, macOS, and Windows with the connector contracts
  released in Phase 6.
- Implement platform authorization callbacks, one-time batch delivery,
  reconciliation, and idempotent import into each local native vault.
- Run the same sanitized provider fixtures and deduplication expectations used
  by the server.
- Apply tagging rules to imported transactions and verify parity with server
  results.

**Exit criteria:** every supported native target can explicitly import from
Enable Banking without receiving provider application secrets, synchronizing
with another vault, or changing server-side normalization semantics.

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
| `implement-server-budgets` | `implement-server-core-finance` |
| `integrate-server-deployment` | `implement-server-csv-transfer`, `implement-server-dashboard-search`, `implement-server-budgets` |
| `harden-server` | `integrate-server-deployment` |
| `build-server-release-pipeline` | `integrate-server-deployment`, `harden-server` |
| `design-banking-connector` | `build-server-release-pipeline` |
| `implement-server-banking-import` | `design-banking-connector` |
| `define-recurring-contracts` | `implement-server-banking-import`, `define-contracts-and-server-domain` |
| `implement-server-recurring` | `define-recurring-contracts`, `implement-server-dashboard-search`, `implement-server-budgets` |
| `native-architecture-spike` | `implement-server-recurring`, `build-server-release-pipeline` |
| `scaffold-native` | `native-architecture-spike`, `define-contracts-and-server-domain` |
| `implement-native-vault-storage` | `scaffold-native` |
| `implement-native-core-finance` | `implement-native-vault-storage` |
| `implement-native-csv-transfer` | `implement-native-core-finance` |
| `implement-native-analysis` | `implement-native-core-finance` |
| `harden-native` | `implement-native-csv-transfer`, `implement-native-analysis` |
| `build-native-release-pipelines` | `harden-native` |
| `implement-native-banking-import` | `implement-server-banking-import`, `build-native-release-pipelines` |
| `implement-automatic-backups` | `build-server-release-pipeline`, `implement-native-banking-import` |

Server phases are sequential release gates. After the Server MVP, Enable Banking
for Server (Phase 6) is delivered first and recurring transactions (Phase 7)
come next, before Flutter foundation (Phase 8) may begin. Flutter feature work
cannot move ahead of its foundation and conformance gates.

## 19. Definition of Done for the Server MVP

The first MVP is complete at the end of Phase 5 only when:

- Users can deploy with Docker Compose on every supported host platform.
- A single owner can create and unlock one encrypted server vault shared by
  concurrent browser sessions on a private network.
- Accounts, transactions, notes, tags, budgets, search, and dashboards work
  without Internet access.
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
  financial records.
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
- Flutter applications in the Server MVP
- Automatic exchange-rate retrieval
- Investment portfolio pricing
- Receipt/image attachment storage
- Payment initiation
- Enable Banking integration in the MVP
- Recurring rules, occurrence generation, and upcoming-recurring widgets in the
  Server MVP (delivered in Phase 7)
- Background server scheduling for recurring transactions
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
| Future provider credentials leak from clients | Separate backend connector with managed secret custody |
| Existing prototype encourages unsafe patterns | Sanitize, isolate, and retire it before production integration |

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
- Capacitor: <https://capacitorjs.com/docs>
- Tauri 2: <https://v2.tauri.app/>
- Docker Compose: <https://docs.docker.com/compose/>
- SQLCipher: <https://www.zetetic.net/sqlcipher/>
- `@journeyapps/sqlcipher`: <https://www.npmjs.com/package/@journeyapps/sqlcipher>
- `@node-rs/argon2`: <https://www.npmjs.com/package/@node-rs/argon2>
- Node.js SQLite (`node:sqlite`): <https://nodejs.org/api/sqlite.html>
- Node.js native TypeScript type stripping:
  <https://nodejs.org/api/typescript.html>
- OWASP Mobile Application Security: <https://mas.owasp.org/>
- OWASP Application Security Verification Standard:
  <https://owasp.org/www-project-application-security-verification-standard/>
- Argon2 specification, RFC 9106: <https://www.rfc-editor.org/rfc/rfc9106>
- Apple Keychain Services:
  <https://developer.apple.com/documentation/security/keychain_services>
- Android Keystore:
  <https://developer.android.com/privacy-and-security/keystore>
- Windows Data Protection API:
  <https://learn.microsoft.com/windows/win32/secauthn/data-protection>
- OWASP Session Management Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>
- Enable Banking API reference:
  <https://enablebanking.com/docs/api/reference/>
