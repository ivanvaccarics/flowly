# 💸 Flowly

### Your money. Your device. Your keys.

**A local-first personal finance app for iOS, Android, macOS, Windows and a
self-hosted Raspberry Pi web deployment.**
No account. No cloud. No tracking. Ever.

![Status](https://img.shields.io/badge/status-early%20development-orange)
![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Platforms](https://img.shields.io/badge/platforms-iOS%20%7C%20Android%20%7C%20macOS%20%7C%20Windows%20%7C%20Web-8A2BE2)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)

</div>

---

## 🌱 The idea

Most finance apps ask you to hand over the most sensitive data you own — every
coffee, every salary, every mistake — in exchange for a dashboard.

Flowly asks for nothing.

Everything lives in an **encrypted vault on hardware you control**, unlocked by
a passphrase only you know. Native apps keep independent local vaults; the web
version keeps one shared vault on your Raspberry Pi for all of your LAN browser
sessions. There is no Flowly cloud account or analytics pipeline quietly
watching. If you want data in another independent vault, you export it and
import it. That's it. 🔐

| 🙃 Most finance apps | 🚀 Flowly |
| --- | --- |
| Sign up with email & password | No registration, no identity |
| Your data on their servers | Your data stays on your device or Raspberry Pi |
| Silent background sync | You decide what moves, and when |
| Telemetry & ads pay the bills | Zero telemetry, zero trackers, zero ads |
| Useless without the Internet | Native apps work offline; web needs only your LAN |
| They hold the keys | Your passphrase unlocks your encryption key |

> 🧭 **One rule we never break:** when the vault is locked, there is nothing
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
Add colors, filter by them, live with them.

### 🌍 Multi-currency, honestly
Every amount is stored as an **integer in minor units** — no floating-point
rounding drama. Each transaction keeps its original currency, and Flowly refuses
to blend unlike currencies into one fake number without a real exchange rate.

### 📊 A dashboard worth opening
Balances per account, net cash flow, income vs. expenses, spending by tag,
budget consumption and upcoming recurring transactions — all computed on your
native device or Raspberry Pi, without an Internet dependency.

### 🔎 Search that actually finds it
Filter by date range, account, tag, amount, currency, status or source — and
free-text search across payee, description and your notes.

### 🎯 Budgets
Weekly, monthly, quarterly, yearly or custom periods. Scope them to accounts or
tags. Turn rollover on or off. Watch the bar fill up (or not 😅).

### 🔁 Recurring transactions
Real calendar arithmetic — not "every 30 days". Rent on the 31st behaves the way
you'd expect in February. Pause and resume any time, no cloud scheduler needed.

### 🔐 Security you can explain to a friend
- A **mandatory passphrase** protects a randomly generated encryption key,
  derived with Argon2id and a per-vault salt.
- **Optional biometrics** — Face ID, Touch ID, Android BiometricPrompt and
  Windows Hello — as a shortcut in installed apps, never as a replacement for
  your passphrase.
- **Encrypted at rest everywhere**: SQLCipher on installed apps and encrypted
  SQLite on the Raspberry Pi.
- **Auto-lock** on inactivity and when the app goes to the background.
- **Fails closed**: wrong key or tampered data raises a clear error, never a
  silently empty vault.

### 📦 Your data, portable
- 📄 **Transaction CSV** — clean, standard, spreadsheet-ready.
- 🗃️ **Complete portable export** — a password-encrypted, versioned archive
  with everything
  (accounts, transactions, tags, budgets, recurring rules, preferences) and a
  checksum manifest. This is the supported way to move a complete vault between
  the Raspberry Pi and installed apps.
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

Two application implementations, one shared contract layer:

- 🌐 **Self-hosted web** — React UI plus a TypeScript service running on your
  Raspberry Pi, shared by browsers on the LAN over required HTTPS
- 📱🖥️ **Installed apps** — a single Flutter codebase for iOS, Android, macOS
  and Windows
- 🔗 **Shared contracts** — versioned JSON Schemas, one canonical CSV/archive
  spec, and golden fixtures that both clients must satisfy in CI

| Platform | Runtime | Storage | Unlock |
| --- | --- | --- | --- |
| 🍎 iOS | Flutter | SQLCipher + Drift | Passphrase + Face/Touch ID |
| 🤖 Android | Flutter | SQLCipher + Drift | Passphrase + BiometricPrompt |
| 💻 macOS | Flutter | SQLCipher + Drift | Passphrase + Touch ID |
| 🪟 Windows | Flutter | SQLCipher + Drift | Passphrase + Windows Hello |
| 🌐 Raspberry Pi web | React + TS service | Encrypted SQLite | Passphrase + secure session |

Why two clients instead of one? Because a browser shell bolted onto a phone is a
worse product than a native app. Flutter brings mature encrypted storage,
biometrics and installers; React provides an accessible interface to the vault
hosted on your Raspberry Pi. The duplication is deliberate, and shared
contracts plus cross-client tests keep the two honest. 🤝

---

## 🚦 Where we are

Flowly is **in early development**. The architecture and security model are
designed and reviewed; the app itself is being built in the open, and there is
no release yet.

| | Milestone | Status |
| --- | --- | --- |
| 0️⃣ | Encrypted storage on Raspberry Pi ARM64 and native targets | 🔜 Up next |
| 1️⃣ | Monorepo scaffolding, shared contracts & domain model | ⏳ Planned |
| 2️⃣ | Vaults: native storage, Raspberry service, sessions and auto-lock | ⏳ Planned |
| 3️⃣ | Accounts, transactions, tags, notes + CSV import/export | ⏳ Planned |
| 4️⃣ | Dashboard, search, budgets, recurring transactions | ⏳ Planned |
| 5️⃣ | Platform polish, accessibility, security review, releases | ⏳ Planned |
| 6️⃣ | Optional bank import via a separate connector service | 🔮 Post-MVP |
| 7️⃣ | Opt-in automatic encrypted backups | 🔮 Post-MVP |

⭐ **Star the repo** to follow along — that's the easiest way to see it grow.

### 🏦 About bank connections

Bank import is a post-MVP goal, and it will be done the safe way: provider
credentials and signing keys will **never** ship inside the app. A separate
service will fetch and normalize data, hand a batch to your unlocked vault once,
and forget it. It's an import channel — not a sync service, and never the source
of truth. The destination vault stays canonical. 🏠

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
- 🔁 **There is no sync between vaults.** Browsers connected to one Raspberry
  Pi share its vault; native apps and other deployments remain independent.
- 📄 **Plain CSV exports are not encrypted.** Use the password-protected archive
  to move data around.
- 💾 **The Raspberry Pi is not a backup.** Manual encrypted exports are required
  in the MVP; optional automatic backups are planned as a future evolution.

---

## 💛 Get involved

Flowly is open source and built in the open — early is the best time to shape
it.

- 💬 **Open an issue** to share an idea, report a bug or challenge a design
  decision
- 🧪 **Try the spikes** and tell us where encrypted storage or biometrics break
  on your device
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
