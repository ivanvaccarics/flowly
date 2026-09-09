# Flowly - Architecture, Security, Requirements, and Implementation Plan

## 1. Purpose

Flowly is a local-first personal finance application for:

- iOS
- Android
- macOS
- Windows
- A self-hosted web deployment on a Raspberry Pi, accessed from browsers on the
  local network

Each installed application is an independent source of truth. The Raspberry Pi
deployment owns one vault shared by its browser sessions; browsers are clients
of that vault and do not persist independent copies. There is no automatic
synchronization between the Raspberry Pi and installed applications. Users move
data between independent vaults through a versioned export/import workflow.

The MVP includes:

- Financial accounts such as bank accounts, cards, cash, and wallets
- Manual transaction management
- Transaction tags and user-authored notes
- Multi-currency support
- Search and advanced filters
- Dashboard and summaries
- Budgets
- Recurring transactions
- Full data export and import
- Local passphrase protection with optional biometric unlock

Username/password accounts, Flowly-operated cloud services, and cross-device
synchronization are explicitly out of scope.

## 2. Current Repository Assessment

The repository is an early prototype rather than an application:

- `README.md` describes the intended product and roadmap but no application has
  been implemented yet.
- `.python-version` selects Python 3.14.
- `enable_banking.py` is a standalone Enable Banking exploration script.
- There is no dependency manifest, application structure, schema migration
  system, automated test suite, CI configuration, or release configuration.
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
| Mobile targets | iOS and Android |
| Desktop targets | macOS and Windows |
| Browser target | React web UI served by a self-hosted Raspberry Pi service on the LAN |
| Distribution | App stores for mobile; direct signed downloads for desktop |
| Account meaning | Financial account, not a Flowly user identity |
| Local unlock | Mandatory local passphrase; optional biometric convenience unlock |
| Device relationship | Installed apps own independent vaults; browser sessions share the Raspberry Pi vault |
| Data transfer | Explicit export/import performed by the user |
| Web ownership | Single owner, one vault, multiple concurrent browser sessions |
| Web deployment | Docker Compose on Linux ARM64 with persistent storage and LAN-only HTTPS |
| Future bank integration | A separate trusted backend/connector is allowed |
| Additional MVP scope | Dashboard, advanced search, multi-currency, budgets, recurring transactions |

## 4. Architecture Options Considered

| Option | Advantages | Disadvantages | Decision |
|---|---|---|---|
| Flutter for every client | One Dart UI codebase; mature mobile and desktop support; web target available | Does not provide the desired central Raspberry Pi vault and multi-PC browser access without adding a server anyway | Not selected |
| Tauri 2 for desktop and mobile plus web | Small binaries; Rust security boundary; high code sharing | Mobile ecosystem and security/database plugins are newer; increases risk for biometric and encrypted database support | Reserve as a future simplification option |
| React UI + local TypeScript service on Raspberry Pi + Flutter installed clients | One Raspberry Pi vault is shared safely by multiple PCs; browser storage is not a source of truth; Flutter retains mature native storage and biometrics | Requires LAN HTTPS, server sessions, concurrency handling, ARM64 packaging, and an always-available Raspberry Pi | **Recommended** |
| Encrypted browser PWA + Raspberry Pi file storage | The Raspberry Pi never handles plaintext domain data | Each browser still owns a divergent vault; conflict resolution, querying, and multi-PC consistency become substantially more complex | Rejected |
| React/TypeScript + Capacitor mobile + Tauri desktop + local service | High TypeScript sharing | Two native shells; mobile Tauri is newer; native security and biometric integrations carry more risk | Valid fallback if minimizing duplicate product code becomes the primary constraint |
| Fully separate native applications | Maximum platform-specific control | Excessive duplication across five targets | Rejected |

### Recommendation

Use a polyglot monorepo with two application implementations:

- **Self-hosted web:** a React and TypeScript frontend plus a TypeScript service
  deployed together on a Raspberry Pi. The service owns the encrypted vault,
  domain operations, sessions, and import/export. Browsers are presentation
  clients and persist no financial records.
- **Installed application:** one Flutter/Dart codebase compiled for iOS,
  Android, macOS, and Windows.
- **Future connector:** a separate TypeScript service that owns Enable Banking
  credentials and API sessions.

This hybrid approach is preferable when a single self-hosted LAN vault,
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
    server/                      # Raspberry Pi API, domain, sessions, storage
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
    raspberry-pi/               # Docker Compose, HTTPS proxy, ARM64 packaging
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

Mutable records exposed by the server API include an opaque revision. Updates
use optimistic concurrency: a stale revision returns an explicit conflict and
never silently overwrites a newer edit from another browser session.

### 6.4 Infrastructure adapters

- Server adapters use HTTP, SQLCipher/SQLite, filesystem streams, session
  storage, and the Raspberry Pi persistent volume.
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

### 7.4 Budgets

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

### 7.5 Recurring rules

- `id`
- Template account, amount, currency, payee, note, and tags
- Frequency and interval
- Start date and optional end date
- Next due date
- Active/paused state
- Generation policy

The MVP generates local transaction occurrences when the app is opened. It does
not require a background cloud scheduler.

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

### 8.2 Raspberry Pi web service

The Raspberry Pi is the source of truth for all of its browser sessions. Use
SQLCipher-backed SQLite if the feasibility spike proves a maintained TypeScript
binding and reliable Linux ARM64 packaging. Otherwise use audited authenticated
record encryption over SQLite behind the same repository interfaces.

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

The web interface requires connectivity to the Raspberry Pi but no Internet
connection or third-party service.

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

### 9.2 Optional biometric unlock

Biometrics are a convenience mechanism, not the only recovery mechanism:

- iOS/macOS: Keychain protected by the system biometric policy
- Android: Keystore key gated by `BiometricPrompt`
- Windows: DPAPI and, where practical, Windows Hello-backed protection
- Raspberry Pi web: passphrase unlock only in the MVP; WebAuthn convenience
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
  links, budgets, recurring rules, and preferences, plus a small manifest
  containing format and checksum metadata.

The complete export is the supported device-to-device transfer format. The
archive contents remain CSV-oriented while preserving normalized relationships.

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
5. Show a preview with errors and duplicate counts.
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

## 11. Dashboard, Search, Multi-Currency, Budgets, and Recurrence

### 11.1 Dashboard

The initial dashboard includes:

- Balance by account
- Net cash flow for a selected period
- Income and expense totals
- Spending by tag
- Budget consumption
- Upcoming recurring transactions

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

Rules use calendar-aware arithmetic, not fixed day counts for monthly or yearly
periods. Time-zone and end-of-month behavior must be covered by tests.

## 12. Future Enable Banking Integration

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

The future connector is an ingestion channel, not the canonical database:

- Each device links and imports independently.
- The local encrypted vault remains the source of truth.
- The connector does not provide cross-device synchronization.
- Provider data is deleted after delivery or after a short documented retry
  window.
- User notes and tags remain local and are never overwritten by provider
  refreshes.

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
| Compromised Raspberry Pi while unlocked | Minimize unlocked lifetime, keep keys only in memory, restrictive service account and filesystem permissions, documented residual risk |
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
  Raspberry Pi web service.
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
  depends only on LAN access to the user's Raspberry Pi and never on Internet
  access or a Flowly-operated service.
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

- Equivalent TypeScript and Dart domain tests for money, budgets, recurrence,
  and deduplication
- Property-based tests in both languages for money, CSV round trips, and
  recurrence
- Golden-vector conformance tests comparing both implementations
- Storage contract tests against server and Flutter adapters
- Migration tests from every released schema
- Cross-language crypto envelope known-answer and tamper tests
- React and Flutter component/accessibility tests
- Raspberry Pi container, HTTPS, session, restart, concurrent-edit, and update
  tests on Linux ARM64
- End-to-end workflows for create, lock-current, lock-all, unlock, CSV merge,
  complete-vault replace, export, and delete
- Platform smoke tests on iOS, Android, macOS, and Windows
- Connector contract tests using sanitized Enable Banking fixtures when that
  phase starts

### Security verification

- Static analysis for TypeScript and Dart
- Dependency and license scanning
- Secret scanning
- Mobile checks aligned with OWASP MASVS
- Web checks aligned with OWASP ASVS
- Threat-model review before beta
- Independent review of key management and export handling before production

## 17. Delivery Plan and Tasks

### Phase 0 - Architecture and security feasibility

#### Task `architecture-spike`

- Build throwaway proof-of-concepts for:
  - Flutter + Drift + SQLCipher create/open/migrate/release builds on iOS,
    Android, macOS, and Windows
  - Flutter secure storage and `local_auth` behavior on every installed target
  - Passphrase-derived key wrapping in TypeScript and Dart with common vectors
  - SQLCipher or authenticated record encryption from TypeScript on Linux ARM64
  - LAN-only HTTPS, session revocation, auto-lock, and concurrent browser access
  - Equivalent TypeScript and Dart repository contract suites
  - Cross-client CSV and encrypted portable-archive round trips
- Record selected libraries, licenses, maintenance health, supported versions,
  binary size, and failure behavior.
- Test wrong-key, corrupted-data, interrupted-write, and lost-biometric cases.

**Exit criteria:** every native target and the Raspberry Pi service can create,
lock, reopen, migrate, and delete an encrypted vault without plaintext
artifacts. If a required library fails, revise the wrapper choice before
building product features.

### Phase 1 - Foundation

#### Task `scaffold-monorepo`

- Create the polyglot repository boundaries and root command surface.
- Configure strict TypeScript and Dart analysis, formatting, testing, and CI.
- Scaffold the React/Vite web UI, TypeScript Raspberry Pi service, Docker
  Compose deployment, and Flutter targets for iOS, Android, macOS, and Windows.
- Add contract generation from canonical schemas to TypeScript and Dart.
- Add environment validation and prohibit secrets in client build variables.

#### Task `define-domain-model`

- Define canonical JSON schemas, CSV/archive schemas, fixture formats, and
  versioning conventions.
- Implement equivalent TypeScript and Dart money, currency, account,
  transaction, tag, budget, and recurrence models and invariants.
- Define matching repository and platform-service interfaces in the server and
  native application.
- Add golden expected results for every cross-client business rule.

**Exit criteria:** both domain suites run without UI/platform dependencies,
produce the same canonical results, and the React and Flutter UIs render a
locked-vault shell.

### Phase 2 - Vault and persistence

#### Task `implement-vault-crypto`

- Implement equivalent server and Flutter vault creation, passphrase
  derivation, DEK wrapping, unlock, passphrase change, auto-lock, and local
  deletion.
- Add Flutter OS secure-store and optional biometric adapters.
- Add server-side passphrase unlock, secure browser sessions, lock-current,
  lock-all, and inactivity expiry.
- Add redaction and sensitive-memory lifecycle rules.

#### Task `implement-native-storage`

- Implement Flutter Drift/SQLCipher storage and migrations for mobile and
  desktop.
- Add indexes, repository transactions, backup exclusions, and restrictive
  filesystem handling.
- Run the shared storage contract suite.

#### Task `implement-server-storage`

- Implement the selected encrypted SQLite storage adapter on Linux ARM64.
- Add persistent-volume handling, migrations, indexes, transactional
  repositories, encrypted rollback snapshots, and restrictive permissions.
- Add same-origin API adapters and conflict detection for concurrent edits.
- Run the shared storage contract suite.

**Exit criteria:** the same fixture vault behaves identically on all target
adapters, and tampering or wrong keys fail closed.

### Phase 3 - Core finance workflow

#### Task `implement-core-finance`

- Build account, transaction, tag, and note CRUD in React and Flutter.
- Add archive/cascade rules and destructive confirmations.
- Add equivalent responsive/adaptive navigation and accessible forms.
- Add validation and actionable error states.

#### Task `implement-csv-transfer`

- Define and document export format version 1.
- Implement transaction CSV and complete portable export in TypeScript and Dart.
- Implement preview, validation, CSV merge, complete-vault replace, rollback,
  and import reports in the server and native clients.
- Add malicious/large/corrupt file tests and spreadsheet formula protection.

**Exit criteria:** a vault exported from each platform imports into every other
platform without changing IDs, amounts, dates, relationships, or notes.

### Phase 4 - Analysis and planning features

#### Task `implement-dashboard-search`

- Add equivalent React and Flutter dashboard summaries, date ranges,
  account/tag filters, and text search.
- Add performance indexes/caches without weakening encryption boundaries.
- Verify native/server result equivalence on the reference data set.

#### Task `implement-budgets-recurring`

- Implement budget periods, filters, and consumption in the server and native
  application.
- Implement recurrence rules and calendar-safe occurrence generation in the
  server and native application.
- Add multi-currency exclusion/conversion rules.

**Exit criteria:** calculations are deterministic across locale, time zone, and
platform.

### Phase 5 - Product hardening and release

#### Task `integrate-platform-shells`

- Complete Flutter mobile permissions, deep links, biometric UX, app-switcher
  privacy, and store metadata.
- Complete Flutter desktop signing, installers, file dialogs, single-instance
  behavior, keyboard behavior, and update verification.
- Complete the Raspberry Pi LAN binding, HTTPS setup, session UX, Docker volume,
  health check, and update/rollback behavior.

#### Task `harden-and-validate`

- Run accessibility, performance, migration, security, and recovery test plans.
- Produce threat model, privacy notice, data-loss warning, and support matrix.
- Generate an SBOM and verify third-party licenses.
- Complete independent cryptographic/key-management review.

#### Task `build-release-pipelines`

- Create reproducible CI builds.
- Separate development, test, and production signing.
- Sign and verify desktop/mobile artifacts.
- Publish reproducible Linux ARM64 container images and a versioned Docker
  Compose deployment with verified migration and rollback behavior.

**Exit criteria:** signed release candidates pass the complete cross-platform
acceptance suite and do not require network access for core workflows.

### Phase 6 - Future Enable Banking connector

#### Task `design-banking-connector`

- Replace the prototype with a server-side connector architecture.
- Define OAuth/session, callback, secret custody, retention, delivery, retry,
  audit, and deletion contracts.
- Define normalized account/transaction mappings and pending-to-booked
  reconciliation.
- Complete a dedicated threat model and privacy assessment.

#### Task `implement-banking-connector`

- Implement the service, provider adapter, one-time client delivery, and
  idempotent import path.
- Add sandbox integration tests and operational monitoring without sensitive
  payload logging.

**Exit criteria:** a client can explicitly link, retrieve, normalize, and import
transactions without receiving Enable Banking application secrets and without
turning the connector into cross-device synchronization.

### Phase 7 - Future automatic backups

#### Task `implement-automatic-backups`

- Add opt-in backup scheduling for the Raspberry Pi vault.
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
| `scaffold-monorepo` | `architecture-spike` |
| `define-domain-model` | `architecture-spike` |
| `implement-vault-crypto` | `scaffold-monorepo`, `define-domain-model` |
| `implement-native-storage` | `implement-vault-crypto` |
| `implement-server-storage` | `implement-vault-crypto` |
| `implement-core-finance` | `implement-native-storage`, `implement-server-storage` |
| `implement-csv-transfer` | `implement-core-finance` |
| `implement-dashboard-search` | `implement-core-finance` |
| `implement-budgets-recurring` | `implement-core-finance` |
| `integrate-platform-shells` | `implement-csv-transfer`, `implement-dashboard-search`, `implement-budgets-recurring` |
| `harden-and-validate` | `integrate-platform-shells` |
| `build-release-pipelines` | `integrate-platform-shells` |
| `design-banking-connector` | `define-domain-model`, `implement-csv-transfer` |
| `implement-banking-connector` | `design-banking-connector` |
| `implement-automatic-backups` | `harden-and-validate`, `build-release-pipelines` |

`implement-native-storage` and `implement-server-storage` can proceed in parallel.
After the contracts are stable, React and Flutter work on each product feature
can also proceed in parallel, but the task is complete only when both
implementations pass the same acceptance fixtures.

## 19. Definition of Done for the MVP

The MVP is complete only when:

- Users can create and unlock encrypted native vaults and one shared Raspberry
  Pi vault.
- Optional biometric unlock never removes passphrase recovery.
- Accounts, transactions, notes, tags, budgets, and recurring rules work
  offline in native apps and without Internet access through the Raspberry Pi
  web deployment.
- Multi-currency values are represented without floating-point errors or
  misleading aggregation.
- Dashboard and filters return equivalent results on every platform.
- Full exports round-trip between every platform.
- Invalid imports fail visibly and atomically; complete portable imports always
  replace the destination vault after explicit confirmation.
- No client artifact contains provider keys, test secrets, or sensitive fixture
  data.
- Locked local storage, journals, caches, logs, and crash reports contain no
  plaintext financial records.
- Accessibility, security, migration, recovery, and platform release checks
  pass.
- The product clearly explains that there is no synchronization and no
  passphrase recovery service.

## 20. Explicitly Out of Scope

- Flowly cloud account or username/password authentication
- Automatic cross-device synchronization
- Shared household vaults
- Flowly-operated or Internet-hosted canonical transaction storage
- Multi-user or role-based access to the Raspberry Pi vault
- Browser-side offline vaults or installable PWA behavior
- Automatic or scheduled backups in the MVP
- Automatic exchange-rate retrieval
- Investment portfolio pricing
- Receipt/image attachment storage
- Payment initiation
- Enable Banking integration in the MVP
- Background server scheduling for recurring transactions

## 21. Key Risks and Mitigations

| Risk | Mitigation |
|---|---|
| SQLCipher wrapper incompatibility across targets | Mandatory Phase 0 proof-of-concept and contract suite |
| Raspberry Pi is unavailable or its storage fails | Manual encrypted exports in the MVP, migration snapshots, visible health status, and automatic backups in a future phase |
| Local HTTPS setup is difficult | Versioned reverse-proxy configuration, guided local certificate enrollment, and an explicit supported-browser matrix |
| Encrypted SQLite binding fails on Linux ARM64 | Mandatory Phase 0 spike and authenticated record-encryption fallback behind the repository interface |
| React and Flutter duplicate UI and domain behavior | Canonical schemas, generated models, shared design tokens, golden vectors, parity gates, and synchronized acceptance criteria |
| Product behavior drifts between TypeScript and Dart | Cross-client conformance CI blocks releases when canonical outputs differ |
| CSV is plaintext and easy to leak | Clear warning, streaming generation, encrypted archive recommended |
| Importing between unsynchronized devices creates duplicates | Stable IDs, provider IDs, fingerprints, preview, explicit conflict policy |
| Biometric APIs vary | Capability detection and passphrase fallback |
| Multi-currency summaries can mislead | Never aggregate unlike currencies without explicit conversion data |
| Recurrence calendar edge cases | Calendar-aware library plus property and time-zone tests |
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
