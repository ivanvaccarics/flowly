# ADR 0017 — Resume the browser session and finish the bank callback in place

Status: Accepted (2026-09-14)

## Context

Two symptoms had one root cause. Refreshing the browser showed the unlock
screen again even though the vault was still open and the session cookie was
still valid, and the Enable Banking callback page — which the bank redirects to
after the consent — could not finish the authorization on its own.

The server already issued a session cookie (`HttpOnly`, `SameSite=Strict`) and
exposed `GET /api/session`, which returns the CSRF token of a live session plus
the vault status. What the shell did not do was ask for it: the CSRF token lived
only in React state, so a reload left the client without a token, the shell fell
back to the unlock screen, and the callback view — which needs the token to
exchange the authorization code — had nothing to work with. The documented
workaround was to paste the redirect URL back into Settings by hand.

## Decision

- The shell resumes from the cookie: after `/api/vault/status` reports an
  unlocked vault, the client calls `/api/session` and adopts the returned CSRF
  token. The passphrase is asked for again only when the session is genuinely
  gone (`session_required`), which is also what the vault auto-lock enforces.
- The bank callback is a first-class route of the same origin that serves the
  app, so the bank's redirect lands on the shell that already holds the session.
- The pending link keeps the provider authorization URL in the encrypted vault
  (`bankLink.authorizationUrl`), so the pending panel survives a reload and can
  always send the browser back to the bank.
- While a link is pending the panel polls the banking status, so an
  authorization completed in another tab is picked up automatically.
- The primary action navigates the current tab ("Continue to the bank"); opening
  a second tab and pasting the redirect URL stay available, but they are
  fallbacks rather than the expected path.

## Consequences

- A reload, a second tab or a return from the bank no longer costs a passphrase.
- The paste box moves under "Bank did not come back automatically?" and stays
  necessary only when the registered callback host is unreachable from the
  browser that authorizes the consent.
- The authorization URL is provider-supplied data inside the encrypted vault, so
  it is covered by the same storage and deletion rules as every other bank
  record.
- The session cookie remains the only browser credential; nothing about the
  resume path weakens `HttpOnly`, `SameSite=Strict`, CSRF or the Origin check.
