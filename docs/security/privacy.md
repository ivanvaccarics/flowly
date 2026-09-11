# Privacy notice (Server MVP)

Flowly is a self-hosted application. The server runs on hardware you control,
and there is no Flowly-operated service in the loop.

## What leaves your device

Nothing, unless you export it yourself:

- No account, no registration, no email, no device identifier.
- No telemetry, analytics, crash reporting or advertising SDK.
- No automatic upload, no cloud backup, no hidden sync.
- The server needs no Internet connection to run; it never calls out.

## What is stored

- An encrypted vault file on your server's volume, containing your accounts,
  transactions, notes, tags and rules.
- A vault header with the Argon2id parameters, the salt and the wrapped data key.
  It contains no secrets in the clear.
- Encrypted snapshots created before imports or migrations.

## What is never stored

- Your passphrase: only the Argon2id-derived key material, wrapped in a way that
  cannot be reversed without the passphrase.
- Financial records in the browser: no `localStorage`, no IndexedDB, no service
  worker cache, no cookie beyond the opaque session identifier.
- Provider credentials (until Phase 6, and then only in the connector service).

## Your controls

- `lock` / `lock-all` end sessions immediately.
- Complete portable archives are the supported way to move or back up data; the
  password is yours alone.
- Deleting the vault removes it from the server (with an explicit confirmation
  and the passphrase).
- Deleting the `data/vault` folder (bind-mounted into the server container)
  destroys the data irrecoverably.

## Logs

Request logs contain method, URL and status code. They never contain payloads,
passphrases, keys or transaction contents.
