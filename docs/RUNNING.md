# Running Flowly

How to run the app today, how to reach it from a phone, and what the mobile and
desktop apps will need when their phases land. The roadmap itself lives in
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

What works today (end of Phase 3):

- create, unlock, lock-this-session, lock-all and change-passphrase
- accounts, transactions with notes and tags, and tag management
- tagging rules with an explicit backfill over existing transactions
- transaction CSV export/import with preview, a plain ZIP with one CSV per
  table for taking your data elsewhere, plus the encrypted complete archive

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

Configuration is environment based; see [`.env.example`](../.env.example) for
the full list (`FLOWLY_HOST`, `FLOWLY_PORT`, `FLOWLY_VAULT_DIR`,
`FLOWLY_STORAGE_ENGINE`, session and auto-lock lifetimes, `FLOWLY_TRUST_PROXY`).

## 3. Self-hosted on your own network (Docker Compose)

```bash
docker compose -f deployment/self-hosted/compose.yaml up --build
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
[DEPLOYMENT.md](./DEPLOYMENT.md).

To reach it from other devices:

1. Publish `8443` on your private LAN address instead of loopback, and set
   `FLOWLY_SITE_ADDRESS` to the hostname you will use.
2. Trust the Caddy local CA on the devices you use.
3. Never forward the port on your router. Flowly is a private-network service.

Backups are manual in the MVP: **Import & export → Export complete archive**
produces a password-encrypted file that is the supported way to move or restore
a vault. Optional automatic encrypted backups arrive in Phase 12.

## 4. Using it from a phone today

Flowly is server first: the phone client is the browser. On a phone connected to
the same private network or VPN, open the server URL, unlock the vault and use
the same screens described above. Nothing is installed on the phone and no data
leaves your server.

Keep it that way: the product is designed to be unreachable from the public
Internet, and the server enforces a private bind by default.

## 5. Mobile and desktop apps (planned)

Phases 8-10 add one Flutter codebase for **iOS, Android, macOS and Windows**
(Phase 11 adds Enable Banking to it). Until those phases run, `apps/native/`
does not exist and this document will not pretend otherwise.

What is already prepared for them:

- `contracts/` holds the canonical JSON Schemas, fixtures and golden vectors
  (money, tagging-rule evaluation) that the Dart client must satisfy unchanged.
- `docs/PLAN.md` fixes the storage, unlock and portability semantics the native
  app has to match (`SQLCipher + Drift`, passphrase plus optional biometrics).
- CI already fails when the generated TypeScript drifts from `contracts/`, and
  the same check will cover the generated Dart types.

When Phase 8 starts, this section gains the exact commands: Flutter SDK
installation, per-platform run targets (simulator, emulator, desktop), the
SQLCipher build for each platform, and the golden-fixture conformance run. The
plan is to keep one command surface, so the native app is verified with the same
fixtures rather than a parallel test suite.

## 6. Working on the next iteration

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
