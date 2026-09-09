# Flowly - Architecture, Security, Requirements, and Implementation Plan

## 1. Purpose

Flowly is a local-first personal finance application for:

- iOS
- Android
- macOS
- Windows
- Web/PWA

Each installation is an independent source of truth. There is no automatic
cross-device synchronization. Users move data between devices through a
versioned CSV export/import workflow.

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

Username/password authentication, cloud accounts, and cross-device
synchronization are explicitly out of scope.

## 2. Current Repository Assessment

The repository is an early prototype rather than an application:

- `README.md` only contains the project name.
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
| Browser target | Installable offline-capable PWA |
| Distribution | App stores for mobile; direct signed downloads for desktop |
| Account meaning | Financial account, not a Flowly user identity |
| Local unlock | Mandatory local passphrase; optional biometric convenience unlock |
| Device relationship | No synchronization; each device owns an independent vault |
| Data transfer | Explicit export/import performed by the user |
| Future bank integration | A separate trusted backend/connector is allowed |
| Additional MVP scope | Dashboard, advanced search, multi-currency, budgets, recurring transactions |

## 4. Architecture Options Considered

| Option | Advantages | Disadvantages | Decision |
|---|---|---|---|
| Flutter for every client | One Dart UI codebase; mature mobile and desktop support; web target available | Web/PWA ergonomics and browser storage integration are less natural; secure storage plugins differ by platform; future backend uses another ecosystem | Not selected |
| Tauri 2 for desktop and mobile plus web | Small binaries; Rust security boundary; high code sharing | Mobile ecosystem and security/database plugins are newer; increases risk for biometric and encrypted database support | Reserve as a future simplification option |
| React/TypeScript PWA + Flutter installed clients | Web is first-class; Flutter has mature mobile and desktop support; one native codebase covers four installed targets; native encrypted storage and biometric support have a clearer implementation path | React and Flutter cannot share runtime UI/domain code; business rules must be implemented in TypeScript and Dart; parity requires strict contracts and conformance tests | **Recommended** |
| React/TypeScript + Capacitor mobile + Tauri desktop + direct PWA | Maximum JavaScript/TypeScript sharing and one UI implementation | Two native shells; mobile Tauri is newer; browser-style UI and plugin boundaries remain on installed clients | Valid fallback if minimizing duplicate product code becomes the primary constraint |
| Fully separate native applications | Maximum platform-specific control | Excessive duplication across five targets | Rejected |

### Recommendation

Use a polyglot monorepo with two client implementations:

- **Web/PWA:** React, TypeScript, Vite, and a service worker.
- **Installed application:** one Flutter/Dart codebase compiled for iOS,
  Android, macOS, and Windows.
- **Future connector:** a separate TypeScript service that owns Enable Banking
  credentials and API sessions.

This hybrid approach is preferable when native platform maturity, encrypted
SQLite support, biometric integration, and consistent installed-app behavior
are more important than maximum source-code sharing. It also avoids forcing a
browser-oriented shell onto mobile and desktop.

The trade-off must be accepted explicitly: React and Flutter will have separate
UI and application/domain implementations. They share specifications rather
than runtime libraries. Product parity is enforced through:

- Versioned JSON Schema contracts
- Generated TypeScript and Dart data types where practical
- One canonical CSV/archive specification
- Shared golden fixtures and expected calculation results
- Cross-client import/export round-trip tests
- One acceptance-test catalogue executed by both clients

Do not attempt to share business logic through WebViews, embedded JavaScript, or
Flutter platform channels. That would add runtime complexity without removing
the need for platform-specific testing.

## 5. Proposed Repository Structure

```text
flowly/
  apps/
    web/                         # React/TypeScript Vite PWA
      src/
        domain/
        application/
        infrastructure/
        ui/
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
both clients. Generated types do not replace runtime validation or domain
invariants.

### 6.2 Client domain and application layers

Implement the same clean boundaries independently in TypeScript and Dart:

- The web domain imports no React, browser, IndexedDB, or network APIs.
- The native domain imports no Flutter widgets, SQL, platform channels, or
  network APIs.
- Application services depend on repositories and platform-service interfaces.
- UI code never queries storage directly.

Both implementations own the same behavior:

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

### 6.4 Infrastructure adapters

- Web adapters use browser APIs and Web Workers.
- Flutter adapters use Drift/SQLite, SQLCipher libraries, platform secure
  storage, `local_auth`, filesystem APIs, and platform-specific backup controls.
- Native plugins must be wrapped behind application-owned interfaces so plugin
  changes do not leak into domain or presentation code.

### 6.5 User interfaces

The two UIs follow one product design specification but are implemented with
their platform-native toolkit:

- React provides a responsive PWA with browser accessibility semantics.
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

### 8.2 Web/PWA

Do not pretend browser storage has native database security. Use IndexedDB as an
opaque ciphertext store:

- Each persisted domain record is encrypted before it reaches IndexedDB.
- Decryption occurs after vault unlock, preferably in a dedicated Web Worker.
- Search and dashboard indexes are rebuilt in memory after unlock.
- The service worker caches application assets, never decrypted financial data.
- The application must continue to work offline after its first successful
  load.
- Browser storage eviction risk is communicated to users, and the UI recommends
  regular exports.

This design intentionally uses a different persistence implementation behind
equivalent language-specific repository contracts. A SQLCipher/WASM
implementation may replace it only if the feasibility spike proves equivalent
security, browser support, and operational reliability.

### 8.3 Storage contract tests

Define one language-neutral behavioral specification and fixture set. Implement
equivalent suites in TypeScript and Dart against their storage adapters. CI must
compare canonical outputs. The suites verify:

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
- Web: WebAuthn-based convenience unlock only when required capabilities are
  available and tested; the passphrase remains supported

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

### 9.4 Passphrase change and loss

- Changing the passphrase re-wraps the DEK; it does not rewrite the database.
- There is no server-side recovery because there is no user account or cloud
  escrow.
- The UI must clearly warn that losing the passphrase and all unlocked devices
  means permanent data loss.
- Recovery is possible only from an export whose password is known.

## 10. CSV Import and Export

### 10.1 Export formats

Provide two workflows:

1. **Transaction CSV:** one human-readable RFC 4180-compatible CSV for analysis
   in spreadsheet tools.
2. **Complete portable export:** a versioned archive containing CSV files for
   accounts, transactions, tags, transaction-tag links, budgets, recurring
   rules, and preferences, plus a small manifest containing format and checksum
   metadata.

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
- Offer a password-encrypted portable archive as the recommended transfer
  option while retaining plaintext CSV for interoperability.
- Never upload exports automatically.

### 10.4 Import workflow

Import is a staged, transactional operation:

1. Select file.
2. Detect format and version.
3. Parse in a worker/background task.
4. Validate headers, types, dates, amounts, currencies, references, file size,
   and row count.
5. Show a preview with errors and duplicate counts.
6. Choose merge or replace.
7. Write atomically.
8. Show a durable import report.

`Replace` requires explicit destructive confirmation and creates a local
encrypted safety snapshot first where the platform allows it.

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

Search semantics must match across native and web adapters.

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
| Browser origin compromise or XSS | Strict CSP, no inline/eval code, Trusted Types where supported, output encoding, dependency review |
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
- Use HTTPS and a restrictive `connect-src` policy for the hosted PWA.
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
- No network dependency for core usage after PWA installation.
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
- Web decryption and CSV parsing must run outside the main UI thread.
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
- The PWA baseline should include current stable Safari, Chromium, and Firefox
  capabilities, with explicit fallback behavior for unsupported WebAuthn or
  storage APIs.

## 16. Testing and Quality Strategy

### Automated tests

- Equivalent TypeScript and Dart domain tests for money, budgets, recurrence,
  and deduplication
- Property-based tests in both languages for money, CSV round trips, and
  recurrence
- Golden-vector conformance tests comparing both implementations
- Storage contract tests against web and Flutter adapters
- Migration tests from every released schema
- Cross-language crypto envelope known-answer and tamper tests
- React and Flutter component/accessibility tests
- PWA offline and update tests
- End-to-end workflows for create, lock, unlock, export, import, merge, replace,
  and delete
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
  - Encrypted IndexedDB records in a Web Worker
  - PWA offline startup and storage persistence behavior
  - Equivalent TypeScript and Dart repository contract suites
  - Cross-client CSV and encrypted portable-archive round trips
- Record selected libraries, licenses, maintenance health, supported versions,
  binary size, and failure behavior.
- Test wrong-key, corrupted-data, interrupted-write, and lost-biometric cases.

**Exit criteria:** every target can create, lock, reopen, migrate, and delete an
encrypted vault without plaintext artifacts. If a required library fails, revise
the wrapper choice before building product features.

### Phase 1 - Foundation

#### Task `scaffold-monorepo`

- Create the polyglot repository boundaries and root command surface.
- Configure strict TypeScript and Dart analysis, formatting, testing, and CI.
- Scaffold the React/Vite PWA and Flutter targets for iOS, Android, macOS, and
  Windows.
- Add contract generation from canonical schemas to TypeScript and Dart.
- Add environment validation and prohibit secrets in client build variables.

#### Task `define-domain-model`

- Define canonical JSON schemas, CSV/archive schemas, fixture formats, and
  versioning conventions.
- Implement equivalent TypeScript and Dart money, currency, account,
  transaction, tag, budget, and recurrence models and invariants.
- Define matching repository and platform-service interfaces in both clients.
- Add golden expected results for every cross-client business rule.

**Exit criteria:** both domain suites run without UI/platform dependencies,
produce the same canonical results, and both clients render a locked-vault
shell.

### Phase 2 - Vault and persistence

#### Task `implement-vault-crypto`

- Implement equivalent web and Flutter vault creation, passphrase derivation,
  DEK wrapping, unlock, passphrase change, auto-lock, and local deletion.
- Add Flutter OS secure-store and optional biometric adapters.
- Add web passphrase unlock and capability-gated WebAuthn convenience unlock.
- Add redaction and sensitive-memory lifecycle rules.

#### Task `implement-native-storage`

- Implement Flutter Drift/SQLCipher storage and migrations for mobile and
  desktop.
- Add indexes, repository transactions, backup exclusions, and restrictive
  filesystem handling.
- Run the shared storage contract suite.

#### Task `implement-web-storage`

- Implement authenticated record encryption over IndexedDB.
- Move unlock-time decryption, indexes, and heavy queries to a Web Worker.
- Add storage persistence detection, eviction messaging, and offline behavior.
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
- Implement preview, validation, deduplication, merge, replace, rollback, and
  import reports in both clients.
- Add malicious/large/corrupt file tests and spreadsheet formula protection.

**Exit criteria:** a vault exported from each platform imports into every other
platform without changing IDs, amounts, dates, relationships, or notes.

### Phase 4 - Analysis and planning features

#### Task `implement-dashboard-search`

- Add equivalent React and Flutter dashboard summaries, date ranges,
  account/tag filters, and text search.
- Add performance indexes/caches without weakening encryption boundaries.
- Verify native/web result equivalence on the reference data set.

#### Task `implement-budgets-recurring`

- Implement budget periods, filters, and consumption in both clients.
- Implement recurrence rules and calendar-safe occurrence generation in both
  clients.
- Add multi-currency exclusion/conversion rules.

**Exit criteria:** calculations are deterministic across locale, time zone, and
platform.

### Phase 5 - Product hardening and release

#### Task `integrate-platform-shells`

- Complete Flutter mobile permissions, deep links, biometric UX, app-switcher
  privacy, and store metadata.
- Complete Flutter desktop signing, installers, file dialogs, single-instance
  behavior, keyboard behavior, and update verification.
- Complete PWA install, offline, CSP, update, and storage-eviction UX.

#### Task `harden-and-validate`

- Run accessibility, performance, migration, security, and recovery test plans.
- Produce threat model, privacy notice, data-loss warning, and support matrix.
- Generate an SBOM and verify third-party licenses.
- Complete independent cryptographic/key-management review.

#### Task `build-release-pipelines`

- Create reproducible CI builds.
- Separate development, test, and production signing.
- Sign and verify desktop/mobile artifacts.
- Publish the static PWA with immutable assets and safe service-worker rollout.

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

## 18. Task Dependencies

| Task | Depends on |
|---|---|
| `scaffold-monorepo` | `architecture-spike` |
| `define-domain-model` | `architecture-spike` |
| `implement-vault-crypto` | `scaffold-monorepo`, `define-domain-model` |
| `implement-native-storage` | `implement-vault-crypto` |
| `implement-web-storage` | `implement-vault-crypto` |
| `implement-core-finance` | `implement-native-storage`, `implement-web-storage` |
| `implement-csv-transfer` | `implement-core-finance` |
| `implement-dashboard-search` | `implement-core-finance` |
| `implement-budgets-recurring` | `implement-core-finance` |
| `integrate-platform-shells` | `implement-csv-transfer`, `implement-dashboard-search`, `implement-budgets-recurring` |
| `harden-and-validate` | `integrate-platform-shells` |
| `build-release-pipelines` | `integrate-platform-shells` |
| `design-banking-connector` | `define-domain-model`, `implement-csv-transfer` |
| `implement-banking-connector` | `design-banking-connector` |

`implement-native-storage` and `implement-web-storage` can proceed in parallel.
After the contracts are stable, React and Flutter work on each product feature
can also proceed in parallel, but the task is complete only when both
implementations pass the same acceptance fixtures.

## 19. Definition of Done for the MVP

The MVP is complete only when:

- Users can create and unlock an encrypted vault on every target.
- Optional biometric unlock never removes passphrase recovery.
- Accounts, transactions, notes, tags, budgets, and recurring rules work
  offline.
- Multi-currency values are represented without floating-point errors or
  misleading aggregation.
- Dashboard and filters return equivalent results on every platform.
- Full exports round-trip between every platform.
- Invalid imports fail visibly and atomically.
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
- Server-side canonical transaction storage
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
| Browser storage is weaker and may be evicted | Encrypted records, mandatory passphrase, persistence detection, export reminders |
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
- Vite PWA guidance: <https://vite-pwa-org.netlify.app/>
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
- Web Crypto API:
  <https://developer.mozilla.org/docs/Web/API/Web_Crypto_API>
- IndexedDB:
  <https://developer.mozilla.org/docs/Web/API/IndexedDB_API>
- Enable Banking API reference:
  <https://enablebanking.com/docs/api/reference/>
