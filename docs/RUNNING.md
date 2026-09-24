# Running Flowly

How to run the app today, on your own machine or server, and what the planned
desktop application will need when its phase lands. The roadmap itself lives in
[PLAN.md](./PLAN.md); binding technical decisions live in [adr/](./adr/).

## 1. What you need

| Requirement | Why |
| --- | --- |
| Node.js 22.12 or newer | Vite 8 and `node-gyp` 11 both expect it. Node 22.9 works but prints a warning. |
| pnpm 12 | `corepack enable pnpm` or `npm install -g pnpm@12` |
| A C toolchain with OpenSSL headers | `pnpm install` compiles the SQLCipher addon through `node-gyp`, which needs its own `python3` alongside `make`, `g++`, `libssl-dev` on Debian/Ubuntu (`openssl-dev` on Alpine) or the Xcode command line tools on macOS. Flowly itself contains no Python. |
| Docker (optional) | Only for the container build and the Compose deployment. |

There is no Flowly account and no cloud dependency: everything below runs on
hardware you control.

## 2. Run it locally (server + web UI)

```bash
pnpm install            # installs the workspace and compiles SQLCipher
pnpm contracts:generate # regenerates types and validators from contracts/
pnpm dev                # server on 127.0.0.1:8787, UI on 127.0.0.1:5173
```

Open <http://127.0.0.1:5173>. The first run shows **Create your vault**: choose
a passphrase, and the server creates an encrypted vault under `FLOWLY_VAULT_DIR`
(default `./data/vault`). Later runs show **Vault locked**.

If the app shows **Vault locked** on a deployment where nobody created a vault,
it already has one — most likely from an acceptance run. See
[TESTING.md](./TESTING.md) for how to unlock or reset it.

What works today (end of Phase 6):

- create, unlock, lock-this-session, lock-all and change-passphrase
- accounts, transactions with notes and tags (paged on the server, 25 rows per
  page by default), and tag management
- tagging rules with an explicit backfill over existing transactions
- transfers between accounts you own: mark one by hand in the movement editor,
  or write a two-sided rule that pairs both legs and keeps them out of income
  and spending; the ledger filters on the transfer flag, on the source and on an
  amount range
- transaction CSV export/import with preview, a plain ZIP with one CSV per
  table for taking your data elsewhere, plus the encrypted complete archive
- Enable Banking: connect a bank from Settings, choose for each shared account
  whether Flowly creates an account or pairs an existing one, refresh on demand
  from the dashboard and, if you switch it on, on every unlock

Useful commands:

```bash
pnpm verify        # formatting, lint, secret scan, types, tests
pnpm build         # compile the server, bundle the UI
pnpm acceptance    # end-to-end run against a server that is already running
pnpm --filter @flowly/server test
pnpm --filter @flowly/web test
node tooling/scripts/vault-smoke.mjs create   # against a running server
node tooling/scripts/vault-smoke.mjs verify   # asserts it starts locked
```

Ready to try the whole product? [TESTING.md](./TESTING.md) has the acceptance
command and a screen-by-screen manual test plan.

Configuration is environment based, and the repository keeps exactly one file
for it: [`.env.example`](../.env.example) at the root, which you copy to `.env`.
That file drives both the Compose stack and a local server run; every value is
optional, and the rest of the settings keep their defaults in
`apps/server/src/config.ts`.

### Connecting a bank (Enable Banking)

Flowly talks to [Enable Banking](https://enablebanking.com/docs/api/quick-start/)
as an Account Information Service. Everything happens from **Settings → Connect
to Enable Banking**; no command line and no configuration file are involved.

1. Register an application in the Enable Banking control panel. Keep the
   **Sandbox** environment while you test, and register the callback URL below
   among the application's **redirect URLs** — Enable Banking rejects a callback
   that is not registered, and so does Flowly.
2. In Flowly, open **Settings → Connect to Enable Banking** and fill in:
   - the **application id** (the UUID that names the `.pem` file),
   - the **private key** (`.pem` file your browser downloaded when you registered
     the application),
   - the **callback URL**, which must be
     `<your Flowly URL>/enablebanking/auth_callback`, including the port you
     actually use (see *The callback URL has to be the address you use* below).
3. Press **Verify and save**. Flowly calls `GET /application` once: a wrong key,
   a key from the other environment, or an unregistered callback URL is rejected
   before anything is stored. The key is then kept only inside the encrypted
   vault — it is never written to a plain file and never returned to the
   browser.
4. Press **Load available banks**, pick your country and account type, search
   your bank by name or BIC, select it and press **Connect**. Flowly shows a
   **Finish the authorization** panel: **Continue to the bank** takes you to
   Enable Banking in the same tab, you log in at the bank, and the bank sends
   you back to `/enablebanking/auth_callback`.
5. Flowly runs in two places at once: `GET /enablebanking/auth_callback` is a
   **server** route, so the bank's redirect finishes the handshake wherever it
   lands, and the Settings panel keeps polling the link until it turns
   authorized. The bank window is separate and usually closes itself; nothing
   has to be copied. The piece that still matters is reachability: the registered
   address has to open Flowly from the browser that approves the consent. When it
   does not — or the vault was locked when the bank redirected — reopen Flowly
   and use **Open it in this tab instead** or **Bank did not come back
   automatically?** to paste the **whole address** from the browser bar
   (including `?code=…&state=…`, or the `error=…` Enable Banking appended) and
   press **Complete connection**. A refusal at the bank is recorded on the link,
   so the panel says what happened instead of waiting forever, and **Delete**
   removes a request that goes nowhere — nothing is imported either way.
6. For each shared account, tell Flowly whether to
   **create** a Flowly account or **pair** an existing one. Accounts you ignore
   are never imported.

Testing on the sandbox: the bank list shows the sandbox credentials returned by
Enable Banking (for example `user1` / `1234`, OTP `012345`). Two callback
arrangements are supported; either way the URL you save in Flowly must be exactly
one of the application's registered redirect URLs:

- **Local only** — register
  `https://localhost:8443/enablebanking/auth_callback` (the URL the Compose stack
  publishes) and use Flowly from that address. The simplest sandbox setup.
- **Over Tailscale/VPN** — register
  `https://<machine>.<tailnet>.ts.net/enablebanking/auth_callback` and make the
  stack answer on that host: publish Caddy on the tailnet interface
  set `FLOWLY_BIND_IP` to the Tailscale address of the machine (Linux; on Docker Desktop the proxy cannot bind it, so use `0.0.0.0` or put Tailscale in front — see [DEPLOYMENT.md](DEPLOYMENT.md#install)) and `FLOWLY_SITE_ADDRESS=<machine>.<tailnet>.ts.net` in `.env`. Certificates come from Caddy's local CA, so trust it on every device you use.

When neither is reachable from the browser, the paste box above completes the
flow anyway: it only needs the redirect URL, not a working callback host.

After that:

- **Sync now** on the dashboard pulls every linked bank; unlocking the vault does
  the same only when **Refresh my banks every time I unlock the vault** is on,
  which it is not by default — a bank consent grants only a few unattended reads
  a day, and a vault you unlock all day would spend them before lunch. A
  connection saved before that default changed is switched off once, on the
  first read; switching it back on yourself is then kept;
- if the bank refuses a read because the consent ran out of accesses for the
  day, Flowly stops there, says when it will try again (six hours, doubling on
  every further refusal up to a day) and skips the bank until then instead of
  asking again;
- the dashboard shows the last sync and a **Sync now** button for a manual
  refresh;
- the first sync of an account looks back 90 days, later syncs resume from the
  stored cursor with a seven-day overlap so pending rows reconcile when the bank
  books them;
- your notes and tags on an imported transaction are never overwritten, and
  unlinking a bank keeps every imported transaction.

**Disconnect Enable Banking** in Settings removes the stored application key,
every bank link and every raw provider payload; the accounts and transactions
that were already imported stay in the vault. Unlinking a single bank keeps the
other links and the same transactions.

#### Where a balance comes from

For an account paired with a bank, the balance Flowly shows **everywhere** — the
dashboard, the Accounts cards and the totals — is the figure Enable Banking
reported at the last sync, in the currency the bank sent. It refreshes when the
vault unlocks (when that setting is on), when you press **Sync now**, and on
every later sync. A movement you add by hand to a linked account therefore does
not move the balance until the bank reports it too.

Accounts with no bank link use the figure the vault can compute for itself: the
account's opening balance plus its booked movements. The bank card in Settings
shows the reported balance per shared account, and the account falls back to the
computed figure when a bank reports none or the link is removed.

#### The callback URL has to be the address you use

The bank sends your browser to the callback URL you registered, so that address
has to be one the browser can actually open. Two rules make this work:

1. It must be registered, exactly, among the application's redirect URLs in the
   Enable Banking control panel.
2. It must be the address you reach Flowly on, including the port. The Compose
   stack publishes `FLOWLY_SITE_PORT` (`8443` by default), so a URL written
   without a port only works if you publish on `443` on purpose
   (`FLOWLY_SITE_PORT=443` in `.env`, then `up -d` — see
   [DEPLOYMENT.md](DEPLOYMENT.md#install) for how the interface has to be set on
   Docker Desktop, and for reaching Flowly through Tailscale without publishing
   on every interface).

Settings compares the saved callback URL with the address in your browser and
warns when they differ. **Use the address I am using now** fills in the right
one, and **Save callback URL** re-verifies it with Enable Banking without
re-uploading the private key. Use one address for the whole flow: open Flowly at
the address you registered before you press **Connect**, otherwise the bank
returns the browser to an origin where you are not signed in and you have to
unlock there to finish.

The section itself is laid out as steps — the application, the bank, the linked
banks — with a **Next** line on the first card naming what is left to do. The
settings you rarely touch and the disconnect action sit behind disclosures.
You can check the route from a shell with:

```bash
curl -sI "https://<the address you use>/enablebanking/auth_callback" | head -1
```

An `HTTP/1.1 200` answer means the shell is served there; a connection error
means the host or port is wrong, and the connection would never come back on its
own — use the paste fallback until the address is right.

If a bank shows **consent expired** (or revoked), the consent lapsed at the bank:
connect that bank again from Settings. Imported transactions stay untouched.
Raw provider responses are kept per account in the vault (`bank_payloads`) so a
refresh can be replayed or audited. The ledger makes that visible without a CLI:
**Raw** on a transaction row opens the provider record behind it — the stored
fields and the bank's fields, flattened into tables, plus the exact JSON. The
plain-text tables ZIP redacts the private key, and only the password-encrypted
archive carries it.

## 3. Self-hosted on your own network (Docker Compose)

```bash
docker compose up --build
```

Two containers start: the server, whose vault lives in `./data/vault` in the
project through a bind mount, and a Caddy reverse proxy that terminates HTTPS on
`127.0.0.1:8443` with a certificate from its own local CA (kept in
`./data/caddy`). Only the proxy publishes a port, and only on the loopback
interface. The server refuses to bind a public interface unless
`FLOWLY_ALLOW_PUBLIC_BIND=true` is set on purpose — that flag is for containers
where the port mapping itself stays private.

Open <https://localhost:8443> and trust the local CA once if the browser warns:
the exact commands, plus upgrade, rollback and backup procedures, are in
[DEPLOYMENT.md](./DEPLOYMENT.md). To put the stack and its tailnet HTTPS mapping
back automatically after a reboot, follow
[AUTOMATIC_STARTUP.md](./AUTOMATIC_STARTUP.md).

To reach it from other devices:

1. Publish `8443` on your private LAN address instead of loopback, and set
   `FLOWLY_SITE_ADDRESS` to the hostname you will use.
2. Trust the Caddy local CA on the devices you use.
3. Never forward the port on your router. Flowly is a private-network service.

Backups are manual in the MVP: **Import & export → Export complete archive**
produces a password-encrypted file that is the supported way to move or restore
a vault. Optional automatic encrypted backups arrive in Phase 12.

## 4. The desktop application (planned)

Flowly is desktop-only: the server with its browser UI is what runs today, and
Phases 8-10 add one **desktop application** for macOS and Windows (Phase 11 adds
Enable Banking to it). There is no mobile client and none is planned. Until
those phases run, `apps/desktop/` does not exist and this document will not
pretend otherwise.

What is already prepared for it:

- `contracts/` holds the canonical JSON Schemas, fixtures and golden vectors
  (money, tagging-rule evaluation) that the Dart desktop client must satisfy
  unchanged.
- `docs/PLAN.md` fixes the storage, unlock and portability semantics the desktop
  app has to match (`SQLCipher + Drift`, passphrase plus optional Touch ID or
  Windows Hello).
- CI already fails when the generated TypeScript drifts from `contracts/`, and
  the same check will cover the generated Dart types.

When Phase 8 starts, this section gains the exact commands: Flutter SDK
installation, the macOS and Windows run targets, the SQLCipher build for each
platform, and the golden-fixture conformance run. The plan is to keep one
command surface, so the desktop app is verified with the same fixtures rather
than a parallel test suite.

## 5. Working on the next iteration

1. Read `docs/PLAN.md` (the phase you are starting) and this document.
2. Implement the phase tasks, keeping contracts first: change `contracts/`, run
   `pnpm contracts:generate`, and commit the generated output.
3. Add a storage change as a **new** migration in
   `apps/server/src/storage/migrations.ts`; never edit an applied migration. The
   runner is transactional and covered by a crash-injection test.
4. Run `pnpm verify` and `pnpm build`; for container-affecting changes, rebuild
   `apps/server/Dockerfile` and rerun the vault smoke test.
5. Update `docs/PLAN.md` (status, decisions, remaining work), `README.md`
   (milestones and behaviour) and add an ADR whenever a decision changes.
6. Commit with a Conventional Commit message; one logical change per commit.

Phase boundaries and dependencies are listed in `docs/PLAN.md` sections 17-18.

### Regenerating the screenshots

The screenshots in `docs/SCREENSHOTS.md` come from a **scratch vault full of synthetic
data**, never from a real one, and they are produced by two scripts so they can
be regenerated after a UI change:

```bash
# 1. Build the app the server will serve, and start it on a throwaway vault.
pnpm --filter @flowly/web-contracts build
pnpm --filter @flowly/web build
pnpm --filter @flowly/server build
rm -rf /tmp/flowly-demo
FLOWLY_VAULT_DIR=/tmp/flowly-demo/vault \
FLOWLY_WEB_DIR="$PWD/apps/web/dist" \
FLOWLY_LOG_LEVEL=warn node apps/server/dist/index.js &

# 2. Fill the vault: accounts, tags, rules and about three months of movements.
pnpm demo:seed -- http://127.0.0.1:8787 --create

# 3. Capture the six sections into docs/images (1440 wide, headless Chrome).
pnpm demo:screenshots -- http://127.0.0.1:8787

# 4. Stop the scratch server and delete the vault.
kill %1 && rm -rf /tmp/flowly-demo
```

- `tooling/scripts/seed-demo.mjs` refuses to touch a vault that already holds
  accounts, so it can never write over real data. Every value it creates is
  invented; the passphrase is `FLOWLY_DEMO_PASSPHRASE` (default
  `flowly demo passphrase 2026`) and only ever opens a scratch vault.
- `tooling/scripts/screenshots.mjs` drives headless Chrome over the DevTools
  protocol — Node's own `WebSocket` is the only dependency — and writes one PNG
  per section into `docs/images/`. Pass `--chrome=/path/to/chrome` or set
  `CHROME_PATH` if Chrome is not where the script looks.
- The viewport is 1440 px wide and `FLOWLY_SCREENSHOT_HEIGHT` (default 1400) px
  tall; the dashboard is captured at 2300 px because its page is long. The
  dashboard's period controls are part of the page, so the script picks the
  three-month preset the way a reader would.
- The demo data is dated relative to the day it is seeded, so the dashboard's
  period, the ledger's month and the rules' coverage stay sensible whenever the
  screenshots are retaken.

## 7. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot find module '@journeyapps/sqlcipher'` | Run `pnpm install`; the addon compiles from source and needs the C toolchain plus OpenSSL headers. |
| `node-gyp` fails with `webidl.util.markAsUncloneable` | The workspace pins `node-gyp@11`; delete `node_modules`, keep the pinned version and reinstall. |
| `the record-encryption engine needs Node's --experimental-sqlite flag` | Only the fallback engine needs it; the test script sets `NODE_OPTIONS` automatically. |
| `423 vault_locked` | The vault locked itself (idle or no active session). Unlock again. |
| `401 session_required` | The browser session expired; unlock again. |
| `409 revision_conflict` | Someone else changed the record. The UI reloads it; reapply your edit. |
| Port 5173 already in use | `pnpm --filter @flowly/web exec vite --port 5199`, or stop the other dev server. |
| Vite warns about Node 22.9 | Upgrade to Node 22.12+; the container already uses a newer 22.x. |
| Forgot the passphrase | There is no recovery. Restore a portable archive whose password you know. |
| `bank_redirect_not_registered` | The callback URL in Settings is not one of the redirect URLs registered for the Enable Banking application. Copy one exactly. |
| `bank_environment_mismatch` | The `.pem` belongs to a PRODUCTION application while the configuration says SANDBOX (or the other way round). Change the environment field. |
| `bank_state_invalid` | The bank redirect was replayed, expired (15 minutes), deleted from Settings, or started in another browser session. The callback page says which: start the connection again, and press **Delete** on a request you no longer want. |
| `ASPSP_RATE_LIMIT_EXCEEDED` while syncing | The bank's own cap on the reads a consent allows per day, not a network problem. Flowly stops asking, shows when it will try again (six hours, doubling per refusal up to a day) and skips the bank until then. Wait it out, or re-authorize the bank from Settings: an access with you present is authenticated and is not part of that budget. |
| The dashboard says a bank is marked *limit reached* and **Sync now** imports nothing | The consent has already been refused today, so the run skips that bank on purpose. The ledger still holds everything the bank shared; the next attempt happens on its own after the time shown. |
| The bank window says **Flowly has no pending request for this code** | The authorization was already completed, deleted, or started in another Flowly instance. Delete the pending request in Settings and connect once more. |
| Flowly still shows an old interface after a rebuild | The shell itself is served `no-cache` now, so a normal reload is enough; before that fix, empty the browser cache or hard-reload. |
| The browser says **Not secure** / warns about the certificate | That is Caddy's local CA, not a broken connection. Trust it once with `pnpm ca:export` and the command it prints (see [DEPLOYMENT.md](DEPLOYMENT.md#certificates)), or serve Flowly through `tailscale serve` and there is nothing to trust. |
| A device still shows the warning after installing the certificate | Trust for the CA profile has to be enabled in the device settings; otherwise reinstall it and accept it as a root CA. |
| A linked bank shows **consent expired** | The bank consent lapsed or was revoked. Connect that bank again from Settings. |
| An account is missing from a sync | Only **mapped** accounts are imported. Map it in Settings; accounts whose currency Flowly cannot store yet are skipped and reported. |
