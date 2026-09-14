# Privacy notice (Server MVP)

This notice is the technical description for whoever runs a server. The
user-facing policy is [PRIVACY_POLICY.md](../../PRIVACY_POLICY.md), and the terms
that go with it are [TERMS_OF_SERVICE.md](../../TERMS_OF_SERVICE.md).

Flowly is a self-hosted application. The server runs on hardware you control,
and there is no Flowly-operated service in the loop.

## What leaves your device

Nothing, unless you export it yourself or connect a bank:

- No account, no registration, no email, no device identifier.
- No telemetry, analytics, crash reporting or advertising SDK.
- No automatic upload, no cloud backup, no hidden sync.
- The server needs no Internet connection to run; without a bank connection it
  never calls out.

## What leaves your server when you connect a bank

Only a configured bank connection sends data off the host, and it goes from your
server straight to the Enable Banking API: your application id, a signed
short-lived JWT, the selected bank and country, the account type, the callback
URL, the requested consent window, the IP address and browser User-Agent of the
device that triggered the request, and a pseudonymous vault id. No name, email,
account number or IBAN is added by Flowly. Account, balance and transaction data
for the accounts you approve comes back and stays in the encrypted vault.
Unlinking a bank removes the consent session and the raw payloads; disconnecting
removes the application credentials too. The full picture is in
[PRIVACY_POLICY.md](../../PRIVACY_POLICY.md).

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
- Provider credentials: the Enable Banking private key lives only inside the
  encrypted vault, is never returned by the API, and never reaches the browser
  bundle.

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
