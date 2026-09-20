<div align="center">

<img src="apps/web/public/logo.svg" alt="Flowly" width="340">

# 💸 Flowly

### Your money. Your device. Your keys.

**A self-hosted personal finance server first, with native apps planned for
iOS, Android, macOS and Windows.**
No account. No cloud. No tracking. Ever.

![Status](https://img.shields.io/badge/status-early%20development-orange)
![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Platforms](https://img.shields.io/badge/platforms-server%20first%20%7C%20native%20planned-8A2BE2)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)
![Container image](https://github.com/ivanvaccarics/flowly/actions/workflows/image.yml/badge.svg)

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
Edit a rule whenever the matching turns out wrong: **Edit** loads it back into
the same builder, and saving keeps its id, its on/off state and its place in the
order. Rules only add tags, and deleting a rule never takes a tag away.

### 🌍 Multi-currency, honestly
Every amount is stored as an **integer in minor units** — no floating-point
rounding drama. Each transaction keeps its original currency, and Flowly refuses
to blend unlike currencies into one fake number without a real exchange rate.

### 📊 A dashboard worth opening
Balances per account, net cash flow, income vs. expenses, a pie chart of
spending by tag and the latest movements, ten at a time, with **Previous** and
**Next** when the vault has more — all computed on your self-hosted server,
without an Internet dependency. Totals always carry their currency, and only
booked transactions move a balance.

### 🔎 Search that actually finds it
Filter by date range, account, tag, amount, currency, status or source — and
free-text search across payee, description and your notes. Filtering runs on the
server, so a large vault stays quick.

### 🏦 Connect your bank (Enable Banking)
Connect a bank from Settings with your Enable Banking application id, private key
and callback URL — the key is verified once and then kept only inside the
encrypted vault. Search your bank by name or BIC, authorize the consent at the
bank — Flowly comes back on its own — and tell Flowly for each shared account
whether to create a new account or pair an existing one. For a linked account
the balance Flowly shows everywhere is the one your bank reports. Banks refresh
when you press **Sync now** on the dashboard, or on every unlock if you switch
that on in Settings — it is off by default, because a consent only grants a
handful of unattended reads a day. When the bank refuses one, Flowly stops asking
and says when it will try again. Pending rows reconcile into booked ones in
place, your notes and tags are never overwritten, every raw provider response is
kept per account, and the vault stays the canonical ledger. Every row imported
from a bank carries a
**Raw** button in the ledger: it shows the fields Flowly stored next to the ones
the bank sent, as tables rather than a JSON blob.

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
- 🗃️ **Every table as a ZIP** — one plain CSV per table plus a manifest, so you
  can take your data elsewhere even if you stop using Flowly.
- 🔒 **Complete portable export** — a password-encrypted, versioned archive with
  everything (accounts, transactions, tags, tagging rules, preferences) and a
  checksum manifest. This is the supported way to move a complete vault between
  independent server and native deployments.
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

docker compose up --build
```

The vault is real now. `POST /api/vault/create` builds an encrypted vault,
`/api/vault/unlock` opens it, and `/api/vault/lock` closes the current session or
every session. Sessions live in an `HttpOnly` cookie with a CSRF token, expire
after an idle window, and the vault locks itself when the last session goes
away. Writes carry the revision they read, so two browsers can never overwrite
each other silently: a stale write gets `409 revision_conflict`.

The browser UI follows the repository's own design system (*Sovereign Ledger*:
slate canvas, white cards with a hairline outline, a tinted sidebar) and the
Flowly brand palette — deep green `#0b3d2e`, medium green `#1e6f4e`, gold
`#d4af37` — for the mark, the product's own actions and the default tag colour.
It has one sidebar and six sections: **Dashboard**, **Accounts**,
**Transactions**, **Tags**, **Rules** and **Settings**. The top bar carries the
section title, the vault state, the local clock and the session controls, and
every section opens with a summary card carrying its status facts and actions.
Accounts are endpoint cards with their real balances and a ribbon of booked
totals, rules are tiles with an on/off switch that reopen in the builder for
editing, and the ledger's filters include quick tag pills. The ledger pages
through its matching rows on the server — 25 per page by default, 50 or 100
from the selector — and always says which window it is showing, so a vault with
thousands of movements is never silently truncated; the dashboard's recent
transactions do the same ten rows at a time. The dashboard charts weekly cash
flow and draws spending by tag as a pie chart per currency, so no chart ever
blends currencies. Accounts can be
archived and restored, tags can be renamed and recoloured in place, and Settings
holds the passphrase change plus export and import, after the Enable Banking
connection. Export comes in three shapes: the single transaction CSV, a plain ZIP
with one CSV per table (and a manifest) for taking everything elsewhere, and the
password-encrypted complete archive. Import is additive for a CSV merge and
replaces the vault for a complete archive, after an explicit confirmation and an
encrypted safety snapshot. Deleting an account or a tag asks for a cascade and
tells you how many records are affected.
The product mark — a white keyhole in a squircle filled with the brand gradient,
next to the rounded `Flowly` wordmark — ships as SVG (plus the iOS icon) in
`apps/web/public` and is documented in [docs/DESIGN.md](docs/DESIGN.md), along
with the tokens and the mapping to what actually ships.

You can drive the whole lifecycle against a running server with
`node tooling/scripts/vault-smoke.mjs create` and then
`node tooling/scripts/vault-smoke.mjs verify` after a restart. The Compose file
publishes the port on `127.0.0.1` only, and the server refuses to bind a public
interface unless `FLOWLY_ALLOW_PUBLIC_BIND=true` is set on purpose.

The server image itself comes from the GitHub Container Registry: CI builds
`linux/amd64` and `linux/arm64` on every change to the code, so
`docker compose pull` fetches `ghcr.io/ivanvaccarics/flowly` instead of compiling
SQLCipher on your own machine — which is what makes a Raspberry Pi a fine host.
Both regular CI and image publication scan the complete Git history with a
pinned Gitleaks image, and publication waits for that scan to pass. The sole
ignored finding is one exact historical fingerprint for a documented synthetic
sandbox fixture, not a blanket path or rule exclusion.

### 📚 Documentation

- [docs/RUNNING.md](docs/RUNNING.md) — how to run Flowly locally, self-host it,
  use it from a phone today, and what the planned mobile/desktop apps will need.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — install on Docker Compose, trust the
  local certificate authority, upgrade, roll back and back up.
- [docs/AUTOMATIC_STARTUP.md](docs/AUTOMATIC_STARTUP.md) — Docker and Tailscale
  on a machine that reboots on its own: the `startup.sh` script and the systemd
  unit that bring the stack and the tailnet HTTPS mapping back at boot.
- [docs/TESTING.md](docs/TESTING.md) — the acceptance script and the manual test
  plan, with what a pass looks like for every screen.
- [docs/DESIGN.md](docs/DESIGN.md) — the UI design system, its tokens and the
  mapping to the sections that actually ship.
- [docs/PLAN.md](docs/PLAN.md) — architecture, security requirements, data
  model and the phase-by-phase delivery plan.
- [docs/adr/](docs/adr/) — the decisions behind the storage engine, key
  hierarchy, sessions, portability, toolchain, concurrency and cascades.
- [docs/security/](docs/security/) — threat model, privacy notice, data-loss
  warning, support matrix, verification status, SBOM, license inventory and the
  [security audit](docs/security/audit-2026-09-15.md).
- [contracts/README.md](contracts/README.md) — the canonical schemas, fixtures
  and golden vectors that both clients must satisfy.
- [docs/TERMS_OF_SERVICE.md](docs/TERMS_OF_SERVICE.md) — the terms for running a
  Flowly instance and for connecting it to a bank.
- [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md) — what Flowly stores, what
  leaves your server, and who is responsible for what.

---

## 🚦 Where we are

Flowly is **in early development**. The architecture and security model are
designed and reviewed, Phase 0 proved the encrypted storage and session
feasibility, Phase 1 stands up the real workspace with canonical contracts, and
Phase 2 delivers the encrypted vault itself: Argon2id unlock, SQLCipher storage,
browser sessions with auto-lock and revision-checked writes, and Phase 3 adds the
daily finance flows with tagging rules and file-based portability. Phase 4 adds
the dashboard and server-side search, and Phase 5 hardens the
deployment: HTTPS with a local certificate authority, upgrade and rollback
documentation, an SBOM and license inventory, and a threat model. Phase 6 then
connects the server to Enable Banking: bank consent with per-account linking, raw
provider payloads stored per account, reconciliation by provider id, and refresh
on demand or on unlock when the setting asks for it. The app is still
pre-release: an independent
cryptographic review and a full assistive-technology audit remain open.

| | Milestone | Status |
| --- | --- | --- |
| 0️⃣ | Server storage, Docker and private-network security feasibility | ✅ Complete |
| 1️⃣ | Server foundation, contracts and TypeScript domain | ✅ Complete |
| 2️⃣ | Server vault, encrypted storage, sessions and auto-lock | ✅ Complete |
| 3️⃣ | Server accounts, transactions, tags, notes, tagging rules and data portability | ✅ Complete |
| 4️⃣ | Server dashboard and search | ✅ Complete |
| 5️⃣ | Server hardening and release | ✅ Complete |
| 6️⃣ | Enable Banking for Server | ✅ Complete |
| 8️⃣ | Flutter foundation and encrypted native vaults | 🔮 Post-MVP |
| 9️⃣ | Flutter feature parity | 🔮 Post-MVP |
| 🔟 | Native hardening and release | 🔮 Post-MVP |
| 1️⃣1️⃣ | Enable Banking for Flutter | 🔮 Post-MVP |
| 1️⃣2️⃣ | Opt-in automatic encrypted backups | 🔮 Post-MVP |

⭐ **Star the repo** to follow along — that's the easiest way to see it grow.

### 🏦 About bank connections

Phase 6 connects the server to **Enable Banking**; Phase 11 adds the same
connector to the Flutter clients. Provider credentials and signing keys **never**
ship inside any client: the application key pair is stored in the encrypted
vault, JWT signing happens on the server only, and the API exposes just a
fingerprint of the matching public key. Bank data arrives as an import channel —
not a sync service, and never the source of truth. The destination vault stays
canonical: imported rows carry their provider id, pending activity reconciles
into booked activity in place, and your notes and tags are never overwritten. 🏠

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
