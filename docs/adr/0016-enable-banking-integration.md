# ADR 0016 — Enable Banking inside the server, not in a separate service

Status: Accepted (2026-09-11)

## Context

Phase 6 delivers Enable Banking for the self-hosted server. `docs/PLAN.md` had
described a **separate connector service** that owns provider credentials, and
the repository kept a prototype that printed an authorization URL and asked the
operator to paste the redirect back by hand.

Two facts changed the picture:

- Enable Banking credentials are an **application key pair**: a private RSA key
  plus an application id. Nothing about them requires a second deployment, and
  the vault already stores secrets encrypted at rest.
- The product is single-user and self-hosted. A second service would add another
  port, another pair of secrets and another thing to back up, without removing
  any trust the operator does not already place in the server that holds the
  vault.

What the original design was really protecting against — provider keys leaking
through a distributed client — is a constraint about **the browser, mobile and
desktop clients**, not about the server.

## Decision

- Implement the connector **inside `apps/server`**, under `src/banking/`:
  JWT signing, the HTTP client, normalization, the sync engine and the service
  that the API routes call.
- Store the Enable Banking application credentials — app id, private key PEM,
  callback URL, environment, default country and PSU type — **inside the vault**
  in a new `bank_connections` table, so they are only readable while the vault
  is unlocked and are covered by the same encryption as every other record.
- Never return the private key to a client. `GET /api/banking/status` exposes
  the application id and a SHA-256 fingerprint of the matching **public** key.
- Keep the raw provider payloads in a dedicated `bank_payloads` table (the
  `row_json` store from the request), one row per response per account, with the
  provider JSON untouched so a refresh can be replayed or audited.
- Record the connection per bank in `bank_links`, and the pairing between a
  provider account and a Flowly account in `bank_accounts`.
- Treat the provider as an **ingestion channel**: the vault stays canonical. A
  sync only creates or reconciles provider transactions, never overwrites the
  user's note or tags, and never deletes anything.
- Keep the boundary ready for Phase 11: the client-neutral delivery contract is
  the JSON the banking endpoints already return, so a Flutter client can adopt
  it without receiving provider secrets.

## Consequences

- `SCHEMA_VERSION` becomes 5. Vaults created earlier migrate forward-only with
  the same passphrase.
- The plain-text tables ZIP gained a `banking.json` entry **with the private key
  redacted**, because that export is deliberately unencrypted. The
  password-encrypted archive carries the full connector, and importing an
  archive whose key was redacted fails loudly instead of installing a connector
  that cannot sign.
- Losing the vault — or importing an archive that replaces it — loses the bank
  consent; the user reconnects the bank and the imported transactions stay.
- An operator who wants the connector isolated later can still move
  `src/banking/` behind a network boundary; the API surface and the vault tables
  are the seam.
- Provider credentials never reach the browser bundle, and the frontend secret
  scan keeps failing the build if a `VITE_*` name ever looks like a secret.
