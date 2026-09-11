# ADR 0009 — Deployment, transport and release evidence

Status: Accepted (Phase 5)

## Context

Phase 5 has to turn a working server into something a person can install, expose
on their own network, upgrade and trust. That means deciding where TLS lives, how
the web client is served, what the release artefacts contain, and which claims we
are willing to make about verification.

## Decision

- **One origin, served by the server.** The server serves the built React app
  with an SPA fallback and keeps `/api/*` as JSON. The browser never talks to a
  second host, and no financial data is stored client-side.
- **TLS terminates in a reverse proxy.** Compose ships Caddy with `tls internal`,
  so a private deployment gets HTTPS with certificates from a local CA that the
  user explicitly trusts. Only the proxy publishes ports, and only on loopback by
  default. The server trusts `X-Forwarded-Proto`, which enables `Secure` cookies
  and HSTS.
- **Security headers are the server's job.** CSP, `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options`, `Cross-Origin-Opener-Policy` and
  `Permissions-Policy` are set on every response, so they apply whether the app
  is reached directly or through the proxy.
- **Operations endpoints stay boring.** `/api/health` reports liveness without
  touching the vault; `/api/system/info` reports version, schema version, engine
  and uptime. Neither exposes paths, keys or financial data.
- **Migrations stay forward-only and transactional.** Upgrades apply pending
  migrations inside a transaction; rollback is an explicit restore of the
  pre-upgrade archive export, never an automatic downgrade.
- **Supply-chain evidence ships with the release.** CI builds both architectures
  with buildx provenance and SBOM attestations, and the repository carries a
  generated CycloneDX SBOM plus a license inventory. `pnpm release:check` fails
  on AGPL, GPL-2/3, SSPL or BUSL in runtime dependencies.
- **Honest verification.** `docs/security/verification.md` separates what the
  automated suite proves from what was reviewed by hand and what is still open:
  an independent cryptographic review and a full assistive-technology audit.

## Consequences

- Installing Flowly requires one extra trust step (importing the local CA), which
  is documented rather than hidden behind a self-signed-certificate warning.
- The image is larger because it contains the built web client; in exchange, a
  deployment is one container plus a proxy with no separate static host.
- SBOM and license artefacts must be regenerated and committed whenever
  dependencies change; CI fails if they drift.
- The MVP deliberately claims less than a full security audit, and the open items
  are visible to anyone reading the repository.
