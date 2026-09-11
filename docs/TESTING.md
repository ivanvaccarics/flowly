# Testing the Flowly MVP

Everything you need to try the Server MVP yourself, plus what a "pass" looks
like and where the sharp edges are. Deployment details are in
[DEPLOYMENT.md](./DEPLOYMENT.md); everyday commands are in
[RUNNING.md](./RUNNING.md).

## 1. Start it

**Local development** (fastest loop, plain HTTP on loopback):

```bash
pnpm install
pnpm contracts:generate
pnpm dev            # API on http://127.0.0.1:8787, UI on http://127.0.0.1:5173
```

**Self-hosted with HTTPS** (closest to a real deployment):

```bash
docker compose -f deployment/self-hosted/compose.yaml up --build -d
# then open https://localhost:8443 and trust the local CA once
```

Use a **scratch vault** while testing. Set `FLOWLY_VAULT_DIR` to a throwaway
directory, or remove the Compose vault folder:

```bash
docker compose -f deployment/self-hosted/compose.yaml down
rm -rf data/vault          # containers write into the project's data/ folder
docker compose -f deployment/self-hosted/compose.yaml up -d
```

## 2. Automated acceptance run

One command exercises the whole MVP against a running server — vault lifecycle,
tagging rules, search, dashboard, concurrency, exports, lock/unlock and
rate limiting:

```bash
node tooling/scripts/acceptance.mjs http://127.0.0.1:8787
# or: pnpm acceptance http://127.0.0.1:8787
```

It prints one line per check and exits non-zero on the first failure. Expected
tail:

```text
16/16 checks passed against http://127.0.0.1:8787
```

Two things to know: it writes records named `Acceptance …` into the vault (delete
them afterwards from the UI), and it deliberately triggers rate limiting, so for
about a minute afterwards unlock attempts may answer `429`.

**It also creates the vault if none exists**, using the acceptance passphrase
(`FLOWLY_ACCEPTANCE_PASSPHRASE`, default `flowly acceptance passphrase 2026`).
That matters when you point it at the vault you are testing by hand: afterwards
the app shows **Vault locked** and your own passphrase will not open it, because
the vault belongs to the acceptance run. Either unlock with the acceptance
passphrase and change it from the workspace, or start over:

```bash
# Docker Compose: remove the vault folder and come back empty
docker compose -f deployment/self-hosted/compose.yaml down
rm -rf data/vault
docker compose -f deployment/self-hosted/compose.yaml up -d

# local run: point the server at a scratch directory instead
FLOWLY_VAULT_DIR=$(mktemp -d) node apps/server/dist/index.js
```

On a fresh deployment the app now says **Create your vault** and asks for a new
passphrase, instead of showing a locked vault you cannot open.

The unit, integration and contract suites are separate:

```bash
pnpm verify          # format, lint, secret scan, types, 148 tests
pnpm build           # compile the server, bundle the UI
pnpm release:check   # license policy for runtime dependencies
```

## 3. Manual test plan

Work through the list with a scratch vault; each line says what to do and what
you should see.

### Vault and sessions

| Do this | Expect |
| --- | --- |
| Open the app on a fresh deployment, enter a passphrase, press **Create vault** | Vault is created; the workspace opens; the status shows `sqlcipher` and schema v4 |
| Restart the server (or the container) and reload | The app comes back **locked**; the same passphrase unlocks it |
| Enter a wrong passphrase | "That passphrase did not unlock the vault." No vault contents |
| Repeat a wrong passphrase many times | After a few attempts: "Too many unlock attempts." |
| Press **Lock this session** in one browser, use a second browser session | First session asks to unlock again, second keeps working |
| Press **Lock all sessions** | Both sessions are locked and the vault is locked |
| Leave the workspace idle for the configured window (default 5 minutes) | The vault locks itself |
| Change the passphrase, then lock all and unlock with the new one | Unlock works; the old passphrase is rejected; data is unchanged |
| Delete the vault (confirmation + passphrase) | The vault is gone; the app offers to create a new one |

### Accounts, transactions, tags

| Do this | Expect |
| --- | --- |
| Add an account (name, type, currency) | It appears in the list and in the transaction form's account picker |
| Add a tag from the colour palette | It appears with that colour and can be selected on transactions |
| Rename a tag and pick another colour, then save | The row shows the new name once; transactions and rules that use the tag keep it |
| Add a transaction with payee, note and a tag | It appears in the table with the amount formatted in its currency |
| Edit the note of a transaction | The change is saved; the revision increases |
| Open the same transaction in two tabs and save both | The second save reports a revision conflict instead of overwriting |
| Filter by account, date range, tag, status or free text | The list narrows and the count updates; nothing is filtered in the browser only |
| Delete a transaction | It disappears; reloading keeps it gone |
| Archive an account | It stays in the list marked archived, and offers **Restore** instead of **Archive** |
| Restore that account | It is active again with the same id, balance and transactions |
| Try to delete an account that has transactions | You are told how many transactions are involved and asked for a cascade |
| Confirm the cascade delete | The account and its transactions are gone |
| Delete a tag that is in use, then confirm the cascade | The tag disappears from transactions and rules everywhere |

### Tagging rules

| Do this | Expect |
| --- | --- |
| Create an AND rule: note contains "espresso" → tag Coffee | New transactions with that note receive the tag automatically |
| Create an OR rule with two conditions | One matching condition is enough |
| Create an amount rule ("amount less than -5000 EUR") | It only matches transactions in EUR; USD transactions are ignored |
| Pause a rule, then add a matching transaction | No tag is added |
| Press **Apply rules to existing transactions** | A report shows how many transactions were evaluated and tagged; running it again reports zero changes |

### Dashboard and search

| Do this | Expect |
| --- | --- |
| Open Dashboard and change the period | Balances, cash flow and spending recompute; pending transactions are excluded |
| Look at the per-currency cards | Each currency has its own totals; nothing is converted or blended |
| Look at the spending-by-tag list | Booked outflows are grouped by tag and currency |

### Import and export

| Do this | Expect |
| --- | --- |
| Export transactions CSV | A spreadsheet-friendly file; negative amounts stay plain numbers |
| Download every table (ZIP), accept the plain-text warning | One ZIP with `accounts.csv`, `transactions.csv`, `tags.csv`, `tagging_rules.csv`, a manifest and a README; `unzip -t` reports no errors |
| Open the ZIP's `transactions.csv` and merge it back through the CSV import preview | The rows are recognised as duplicates instead of being written twice |
| Import that CSV back, first through the preview | Preview shows valid rows, duplicates and any new tags before anything is written |
| Confirm the merge | Report says how many rows were created and how many duplicates were skipped |
| Import a malformed CSV | Per-line errors; nothing is written for the invalid rows |
| Export a complete archive with a password (min 8 characters) | A `.flowly` file downloads |
| Import that archive into a **fresh** vault | Confirmation, an encrypted snapshot, then a full replace; counts are reported |
| Import the same archive into the vault it came from | Refused ("same vault") |
| Import with the wrong password or a tampered file | Explicit failure; the destination vault is untouched |

### Security and operations

| Do this | Expect |
| --- | --- |
| Open the app over the Compose stack | HTTPS with the local CA; the browser shows no warning once the CA is trusted |
| Inspect the response headers (browser devtools) | `content-security-policy`, `strict-transport-security`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer` |
| `curl http://127.0.0.1:8787/api/system/info` | Version, schema version, engine, uptime — no paths, keys or financial data |
| Log in from a second device on the same private network | Works over the private address; nothing is exposed to the Internet |

## 4. What is intentionally not there yet

- **No passphrase recovery.** Lose it and the vault stays closed; see
  `docs/security/data-loss.md`.
- **No automatic backups.** Export archives manually; Phase 12 adds scheduling.
- **No multi-user or sharing.** One owner, one vault.
- **No mobile app.** The phone client is the browser (Phases 8-11 add Flutter).
- **Pending transactions** do not move balances or cash flow.
- **No implicit currency conversion**, anywhere.

## 5. Reporting something broken

When a check fails, note:

1. What you did, step by step, and the expected result.
2. What actually happened (screenshot or exact message; for API calls, the status
   code and body).
3. The output of `curl http://127.0.0.1:8787/api/system/info` (or
   `https://localhost:8443/api/system/info`).
4. Whether it reproduces after a restart, and on which host/browser.

Never paste a passphrase, an export password, a vault file or real transaction
data into a bug report.
