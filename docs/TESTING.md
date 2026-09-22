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
docker compose up --build -d
# then open https://localhost:8443 and trust the local CA once
```

Use a **scratch vault** while testing. Set `FLOWLY_VAULT_DIR` to a throwaway
directory, or remove the Compose vault folder:

```bash
docker compose down
rm -rf data/vault          # containers write into the project's data/ folder
docker compose up -d
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
docker compose down
rm -rf data/vault
docker compose up -d

# local run: point the server at a scratch directory instead
FLOWLY_VAULT_DIR=$(mktemp -d) node apps/server/dist/index.js
```

On a fresh deployment the app now says **Create your vault** and asks for a new
passphrase, instead of showing a locked vault you cannot open.

The unit, integration and contract suites are separate:

```bash
pnpm verify          # format, lint, frontend env guard, types and test suites
pnpm build           # compile the server, bundle the UI
pnpm release:check   # license policy for runtime dependencies
```

GitHub CI additionally runs pinned Gitleaks 8.30.1 over the complete Git
history. The public container workflow runs the same gate before either
architecture is built, so a failed secret scan cannot publish an image. The
sole `.gitleaksignore` entry identifies one historical synthetic sandbox fixture
by its exact finding fingerprint; it does not exempt a file, path or rule.

## 3. Manual test plan

Work through the list with a scratch vault; each line says what to do and what
you should see.

### Vault and sessions

| Do this | Expect |
| --- | --- |
| Open the app on a fresh deployment, enter a passphrase, press **Create vault** | Vault is created and the workspace opens with the vault unlocked |
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
| Press **Add transaction** on the ledger | The record form opens in a dialog over the page; saving it closes the dialog and the new movement is at the top of the ledger |
| Look at the top of any section | A tinted banner names what the section is about (green for money, violet for automation, slate for the vault) with its figures, and a headline with the section's action sits under it; the top bar carries the breadcrumb above the title |
| Edit the note of a transaction | The change is saved; the revision increases |
| Click the date (or the payee, the note, the tags, the amount) of a row | The movement opens in the same dialog **Add transaction** uses, prefilled with its account, date, amount, payee, note, status and tags; **Cancel** closes it without writing, and the row's **Edit** button opens it too. The status chip is the exception: a click there only switches booked ↔ pending |
| Open any dialog while the page is scrolled, with the top bar pinned | The dialog covers the whole window, top bar included: its title is never hidden under the bar and the first field stays reachable |
| Open the same transaction in two tabs and save both | The second save reports a revision conflict instead of overwriting |
| Filter by account, date range, tag, status or free text | The list narrows and the count updates; nothing is filtered in the browser only |
| Look at the footer of a filtered ledger with more rows than one page | It reads `Showing 1–25 of N transactions` with `Page 1 / x`; **Next** shows the following rows and **Previous** comes back; **Rows per page** switches to 50 or 100 and starts again from page 1 |
| Change any filter, or record a transaction, while on a later page | The ledger returns to page 1 of the new result set |
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
| Start a second rule in the **New rule** card, leave it half written, then press **Edit** on the first one | A dialog opens over the page with the rule's name, conditions and tags; the card behind keeps the half-written rule exactly as it was |
| Change the note the rule matches in the dialog and press **Save changes** | The dialog closes, the tile shows the new expression, and the rule keeps its id and on/off state |
| Press **Edit**, then close the dialog with **Cancel**, the X or `Esc` | Nothing is written and the **New rule** card is still holding its own draft |
| Create an OR rule with two conditions | One matching condition is enough |
| Create an amount rule ("amount less than -5.10 EUR") | It only matches transactions in EUR; USD transactions are ignored, and the amount is read as 5.10 in that currency, not as a count of cents |
| Type a rule in the composer and stop | The **Live evaluation** line reports how many of the most recent transactions the draft matches, without saving anything; **Simulate on 100 tx** repeats the read on demand and **Reset** empties the composer |
| Look at the overview column next to the composer | **Total matches** and the covered percentage count the transactions at least one active rule matches, the bar and its legend break that coverage down per tag, and the registry's **Matches** column agrees with them |
| Filter the registry to **Active**, then press **Enable all** / **Disable all** | Paused rules disappear from the filtered table; the header action flips every rule and the overview follows |
| Click a rule row (not its switch or its buttons) | The edit dialog opens for that rule; the row's own switch still only pauses it |
| Pause a rule, then add a matching transaction | No tag is added |
| Press **Apply rules to existing transactions** | A report shows how many transactions were evaluated and tagged; running it again reports zero changes |

### Dashboard and search

| Do this | Expect |
| --- | --- |
| Open Dashboard and change the period | Balances, cash flow and spending recompute; pending transactions are excluded |
| Look at the per-currency cards | Each currency has its own totals; nothing is converted or blended |
| Look at any amount | Figures are written the Italian way — `1.234,56` — with the currency code after them, and the ledger's amount column lines up under its own header |
| Look at the spending pie chart and its legend rows | Each currency gets its own pie, sized by booked outflows per tag, with the period total in the middle and one legend row per tag |
| Point at a week of the cash-flow chart, then walk it with **←**/**→** | The week lights up with a vertical guide and a tooltip naming the dates, income, expenses and net; the other weeks dim; the arrow keys move the same readout without adding tab stops |
| Hover a slice or a legend row of the spending pie | The slice thickens, the other slices dim, the legend row highlights and the hole reads the tag's name, amount, share and currency instead of the period total |
| Click a cash-flow week, then a slice or legend row | The ledger opens filtered to that week's dates, or to that tag inside the dashboard's period, with the filters visible in the form and **Clear filters** at hand |
| Press **Export data** in the dashboard header | Settings opens with the export block already in view and focused |
| Look at the **Bank sync** card | Without a connected bank it offers **Connect to Enable Banking**; with one it shows the last sync, the paired accounts and a **Sync now** button |
| Look at the **Recent transactions** card with more than ten movements in the vault | Ten rows plus `Showing 1–10 of N transactions` and **Previous**/**Next**; the header chip counts every match, and **See all** opens the full ledger |
| Look at the dashboard side column | The card is the bank sync, the spending breakdown and the accounts summary: the vault status lives in the shell's sidebar and top bar, not on the dashboard |

### Bank connection (Enable Banking)

Use a sandbox application while testing; the bank list shows the sandbox
credentials Enable Banking returns.

| Do this | Expect |
| --- | --- |
| Settings → Connect to Enable Banking: paste a wrong application id or a callback URL that is not registered for the application | A clear rejection; nothing is stored |
| Fill in the application id, choose a `.pem` key and the registered callback URL, press **Verify and save** | The card switches to the configured state and shows the application name, environment and a short key fingerprint — never the key |
| Press **Load available banks** for your country | The banks Enable Banking offers in that country, with a **Connect** button each |
| Press **Connect**, then **Open the bank page** and finish the authorization at the bank | The browser returns to `/enablebanking/auth_callback` and Flowly lists the shared accounts |
| When the callback host is not reachable, copy the redirect URL from the address bar into **URL you were redirected to** and press **Complete connection** | Same result; an Enable Banking `error=` parameter is shown as plain text |
| Press **Disconnect Enable Banking** and confirm | The application key, the links and the raw payloads disappear; imported accounts and transactions stay |
| Choose **Create a new account** for one and **Ignore** for another | The created account appears under Accounts with the bank as institution; the ignored one is never imported |
| Press **Sync now** on the dashboard | Report with created/updated/unchanged counts; the imported rows appear in Transactions with source `enable-banking` |
| Re-run the sync | Nothing is duplicated: the report says `0 new`, `1 unchanged` |
| Press **Sync now** after the bank has refused a read for its daily cap | The dashboard says the bank's daily access limit is reached and when Flowly will try again; the report counts that bank as blocked and spends no further provider read |
| Edit the note of an imported transaction, then sync again | The note and your tags survive; only provider fields are reconciled |
| Unlink the bank from Settings | The link and its raw payloads disappear; every imported transaction stays |
| Restart the server and unlock | The unlock never waits for the bank. Linked banks refresh in the background only with **Refresh my banks every time I unlock the vault** switched on — off by default — otherwise press **Sync now** |

### Import and export

| Do this | Expect |
| --- | --- |
| Export transactions CSV | A spreadsheet-friendly file; negative amounts stay plain numbers |
| Download every table (ZIP), accept the plain-text warning | One ZIP with `accounts.csv`, `transactions.csv`, `tags.csv`, `tagging_rules.csv`, `banking.json`, a manifest and a README; `unzip -t` reports no errors, and `banking.json` carries no private key |
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
- **Pending transactions** do not move cash flow. A bank-linked account shows
  the balance the bank reports; the others show their booked movements.
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
