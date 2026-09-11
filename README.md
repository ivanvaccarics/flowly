# 💸 Flowly

### Your money. Your device. Your keys.

**A self-hosted personal finance server first, with native apps planned for
iOS, Android, macOS and Windows.**
No account. No cloud. No tracking. Ever.

![Status](https://img.shields.io/badge/status-early%20development-orange)
![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Platforms](https://img.shields.io/badge/platforms-server%20first%20%7C%20native%20planned-8A2BE2)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

</div>

---

## 🌱 The idea

Most finance apps ask you to hand over the most sensitive data you own — every
coffee, every salary, every mistake — in exchange for a dashboard.

Flowly asks for nothing.

Everything lives in an **encrypted vault on hardware you control**, unlocked by
a passphrase only you know. The first release stores one shared vault on your
self-hosted server for all of your private-network browser sessions. Planned
native apps will keep independent local vaults. There is no Flowly cloud account
or analytics pipeline quietly watching. If you want data in another independent
vault, you export it and import it. That's it. 🔐

| 🙃 Most finance apps | 🚀 Flowly |
| --- | --- |
| Sign up with email & password | No registration, no identity |
| Your data on their servers | Your data stays on infrastructure you control |
| Silent background sync | You decide what moves, and when |
| Telemetry & ads pay the bills | Zero telemetry, zero trackers, zero ads |
| Useless without the Internet | The server needs only your private network |
| They hold the keys | Your passphrase unlocks your encryption key |

> 🧭 **One promise we never break:** when the vault is locked, there is nothing
> readable on disk. Not in the database, not in journals, not in caches, not in
> logs.

---

## ✨ What Flowly does

### 🏦 Accounts & transactions
Checking, savings, credit cards, cash, wallets, investments — each with its own
currency. Add transactions with payee, dates, status and tags. Your personal
notes stay **separate** from imported bank descriptions, so nothing you write
ever gets overwritten. 📝

### 🏷️ Tags that behave
Unicode-aware, case-insensitive matching with the casing you typed preserved.
Add colors, filter by them, live with them. Tags you add by hand and tags added
by a rule share the same set — a rule never removes a tag you chose.

### 🪄 Rules that tag for you
Write a rule once and Flowly keeps applying it. Conditions combine with AND or
OR over your note, the payee, the imported description, the amount or the
account — "notes contain rent", "payee is ACME, or amount is over 1000" — and
assign one or more tags. Rules run on new transactions and imports; you can also
apply them to what you already have, with a preview of exactly what will change.
Rules only add tags, and deleting a rule never takes a tag away.

### 🌍 Multi-currency, honestly
Every amount is stored as an **integer in minor units** — no floating-point
rounding drama. Each transaction keeps its original currency, and Flowly refuses
to blend unlike currencies into one fake number without a real exchange rate.

### 📊 A dashboard worth opening
Balances per account, net cash flow, income vs. expenses, spending by tag,
budget consumption and upcoming recurring transactions — all computed on your
self-hosted server, without an Internet dependency.

### 🔎 Search that actually finds it
Filter by date range, account, tag, amount, currency, status or source — and
free-text search across payee, description and your notes.

### 🎯 Budgets
Weekly, monthly, quarterly, yearly or custom periods. Scope them to accounts or
tags. Turn rollover on or off. Watch the bar fill up (or not 😅).

### 🔁 Recurring transactions
Real calendar arithmetic — not "every 30 days". Rent on the 31st behaves the way
you'd expect in February. Pause and resume any time, no cloud scheduler needed.
*Next feature after bank connections: scheduled for Phase 7, before any Flutter
work.*

### 🔐 Security you can explain to a friend
- A **mandatory passphrase** protects a randomly generated encryption key,
  derived with Argon2id and a per-vault salt.
- **Optional biometrics are planned for native apps** — Face ID, Touch ID,
  Android BiometricPrompt and Windows Hello will be shortcuts, never
  replacements for your passphrase.
- **Encrypted at rest**: SQLCipher 4 on the self-hosted server — verified in
  Phase 0 on Linux `arm64` and `amd64` with no readable data on disk while the
  vault is locked — and SQLCipher on installed apps.
- **Auto-lock** on inactivity and when the app goes to the background.
- **Fails closed**: wrong key or tampered data raises a clear error, never a
  silently empty vault.

### 📦 Your data, portable
- 📄 **Transaction CSV** — clean, standard, spreadsheet-ready.
- 🗃️ **Complete portable export** — a password-encrypted, versioned archive with
  everything (accounts, transactions, tags, tagging rules, budgets, preferences,
  and recurring rules once Phase 7 lands) and a checksum manifest. This is the
  supported way to move a complete vault between independent server and native
  deployments.
- 🛡️ Spreadsheet formula-injection protection on export.
- ✅ Import with a **preview first**: transaction CSVs merge after duplicate
  checks; complete portable archives always replace the destination vault after
  explicit confirmation. Every import is atomic and nothing is silently
  dropped.
- 🧬 Smart deduplication via stable IDs, provider IDs, then a deterministic
  fingerprint.

### 🕵️ Privacy, by construction
No registration · No telemetry · No ad SDKs · No automatic upload · No Internet
dependency · One-tap local data deletion.

---

## 🧱 How it's built

The delivery strategy starts with the server:

- 🌐 **Self-hosted web** — React UI plus a TypeScript service running on your
  chosen Docker host, shared by browsers on a private LAN or VPN over required
  HTTPS. Supported hosts are Linux `amd64`/`arm64` and Docker Desktop on macOS
  and Windows.
- 📱🖥️ **Installed apps, planned after the Server MVP** — a single Flutter
  codebase for iOS, Android, macOS and Windows
- 🔗 **Shared contracts** — versioned JSON Schemas, one canonical CSV/archive
  spec, and golden fixtures that both clients must satisfy in CI

| Platform | Runtime | Storage | Delivery |
| --- | --- | --- | --- |
| 🌐 Self-hosted server | React + TS service | Encrypted SQLite | Server MVP, Phases 0-5 |
| 🍎 iOS | Flutter | SQLCipher + Drift | Core Phases 8-10; banking Phase 11 |
| 🤖 Android | Flutter | SQLCipher + Drift | Core Phases 8-10; banking Phase 11 |
| 💻 macOS | Flutter | SQLCipher + Drift | Core Phases 8-10; banking Phase 11 |
| 🪟 Windows | Flutter | SQLCipher + Drift | Core Phases 8-10; banking Phase 11 |

Why two clients instead of one? Because a browser shell bolted onto a phone is a
worse product than a native app. React first provides an accessible interface
to the self-hosted vault. After that release is stable, Flutter adds mature
encrypted storage, biometrics and installers. Shared contracts plus
cross-client tests keep the two implementations honest. 🤝

### 🗂️ Inside the repository

```text
apps/server             TypeScript service: domain, application, Fastify API
apps/web                React/Vite browser client (no vault storage)
packages/web-contracts  Generated types and Ajv validators from the schemas
contracts/              JSON Schemas, fixtures and golden expected results
deployment/self-hosted  Docker Compose for the server vault
spikes/                 Phase 0 feasibility code, kept as evidence
```

## 🛠️ Run it locally

Prerequisites: **Node.js 22.12+** and **pnpm** (`corepack enable pnpm`).

```bash
pnpm install            # install the workspace
pnpm contracts:generate # regenerate types from contracts/ (committed output)
pnpm dev                # server on 127.0.0.1:8787 + UI on 127.0.0.1:5173
pnpm verify             # format, lint, secret scan, types and tests
pnpm build              # compile the server and bundle the UI

docker compose -f deployment/self-hosted/compose.yaml up --build
```

The vault is real now. `POST /api/vault/create` builds an encrypted vault,
`/api/vault/unlock` opens it, and `/api/vault/lock` closes the current session or
every session. Sessions live in an `HttpOnly` cookie with a CSRF token, expire
after an idle window, and the vault locks itself when the last session goes
away. Writes carry the revision they read, so two browsers can never overwrite
each other silently: a stale write gets `409 revision_conflict`.

The browser UI covers the whole daily flow: unlock or create the vault, manage
accounts, add transactions with notes and tags, curate tags, write tagging rules
and backfill them, and move data in and out. Deleting an account or a tag asks
for a cascade and tells you how many records are affected; importing a complete
archive always replaces the vault after an explicit confirmation and an
encrypted safety snapshot.

You can drive the whole lifecycle against a running server with
`node tooling/scripts/vault-smoke.mjs create` and then
`node tooling/scripts/vault-smoke.mjs verify` after a restart. The Compose file
publishes the port on `127.0.0.1` only, and the server refuses to bind a public
interface unless `FLOWLY_ALLOW_PUBLIC_BIND=true` is set on purpose.

---

## 🚦 Where we are

Flowly is **in early development**. The architecture and security model are
designed and reviewed, Phase 0 proved the encrypted storage and session
feasibility, Phase 1 stands up the real workspace with canonical contracts, and
Phase 2 delivers the encrypted vault itself: Argon2id unlock, SQLCipher storage,
browser sessions with auto-lock and revision-checked writes. The app itself is
being built in the open and there is no release yet.

| | Milestone | Status |
| --- | --- | --- |
| 0️⃣ | Server storage, Docker and private-network security feasibility | ✅ Complete |
| 1️⃣ | Server foundation, contracts and TypeScript domain | ✅ Complete |
| 2️⃣ | Server vault, encrypted storage, sessions and auto-lock | ✅ Complete |
| 3️⃣ | Server accounts, transactions, tags, notes, tagging rules and data portability | ✅ Complete |
| 4️⃣ | Server dashboard, search and budgets | ⏳ Planned |
| 5️⃣ | Server hardening and release | ⏳ Planned |
| 6️⃣ | Enable Banking for Server | 🔮 Post-MVP |
| 7️⃣ | Recurring transactions — the next feature after banking | 🔮 Post-MVP |
| 8️⃣ | Flutter foundation and encrypted native vaults | 🔮 Post-MVP |
| 9️⃣ | Flutter feature parity | 🔮 Post-MVP |
| 🔟 | Native hardening and release | 🔮 Post-MVP |
| 1️⃣1️⃣ | Enable Banking for Flutter | 🔮 Post-MVP |
| 1️⃣2️⃣ | Opt-in automatic encrypted backups | 🔮 Post-MVP |

⭐ **Star the repo** to follow along — that's the easiest way to see it grow.

### 🏦 About bank connections

Bank import is a post-MVP goal: Phase 6 adds it to the server, and Phase 11 adds
it to Flutter. Provider credentials and signing keys will **never** ship inside
either client. A separate service will fetch and normalize data, hand a batch to
the unlocked destination vault once, and forget it. It's an import channel —
not a sync service, and never the source of truth. The destination vault stays
canonical. 🏠

Recurring transactions come between the two banking steps, as Phase 7, so they
land before any Flutter work starts.

---

## 🙅 What Flowly will never do

- ☁️ Create a Flowly cloud account for you
- 🔄 Sync your devices automatically behind your back
- 🗄️ Store your transactions in a Flowly-operated cloud
- 📈 Guess exchange rates or portfolio prices for you
- 💳 Move money on your behalf
- 👀 Ship analytics, ads or trackers

---

## ⚠️ Please read this before trusting it with your data

- 🔑 **There is no passphrase recovery.** No account, Flowly service or key
  escrow exists. Lose your passphrase and every unlocked vault, and the data is
  gone forever. Your only safety net is an export whose password you know.
- 🔁 **There is no sync between vaults.** Browsers connected to one server
  deployment share its vault; future native apps and other deployments remain
  independent.
- 📄 **Plain CSV exports are not encrypted.** Use the password-protected archive
  to move data around.
- 💾 **The server is not a backup.** Manual encrypted exports are required in
  the MVP; optional automatic backups are planned for Phase 12.

---

## 💛 Get involved

Flowly is open source and built in the open — early is the best time to shape
it.

- 💬 **Open an issue** to share an idea, report a bug or challenge a design
  decision
- 🧪 **Try the spikes** and tell us where encrypted server storage or Docker
  deployment breaks on your host
- 🌍 **Translate** — all UI text is externalized from day one
- ♿ **Accessibility feedback** is especially welcome; we target WCAG 2.2 AA
- 📣 **Tell a friend** who's tired of handing their bank history to a startup

Good first areas: shared schemas & fixtures, CSV edge cases, recurrence calendar
tests, and design tokens.

We follow [Conventional Commits](https://www.conventionalcommits.org/), and we
ask one thing above all: **never commit secrets or real financial data.** 🔒

---

## 📜 License

Released under the [Apache License 2.0](LICENSE). Use it, fork it, audit it. 🔍
