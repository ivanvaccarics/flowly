# ADR 0003 — Session handling, transport and auto-lock

Status: Accepted (Phase 0)

## Context

The server is a single-owner vault reached from browsers on a private LAN or
VPN. It must never be exposed to the public Internet, must survive concurrent
browser sessions, and must not keep an unlocked vault around after the user
walks away.

## Decision

- Serve the React client and the API from the same origin over **HTTPS**
  (`node:https` in the spike, a reverse proxy with local certificates in
  deployment), and bind to a private address.
- Authenticate browsers with a server-side session referenced by an
  `HttpOnly; SameSite=Strict; Path=/` cookie, marked `Secure` whenever TLS is
  active.
- Require a per-session **CSRF token** on every mutating request and validate the
  `Origin` header against an allow-list.
- Rate-limit unlock attempts per client address, expire sessions on idle and
  absolute timeouts, and support `lock-current` and `lock-all`.
- Auto-lock the vault when no session has been active for the configured idle
  window.

## Consequences

- Losing a laptop does not leave an unlocked vault behind on the server.
- Sessions are server state: restarting the process always returns to a locked
  vault, which matches the plan's "restarts return to a locked state".
- The spike authenticates with the vault passphrase only; multi-user access
  remains explicitly out of scope.
