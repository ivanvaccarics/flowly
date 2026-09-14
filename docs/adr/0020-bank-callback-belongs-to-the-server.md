# ADR 0020 — The bank callback belongs to the server

Status: Accepted (2026-09-15)

## Context

`GET /enablebanking/auth_callback` was a route of the browser shell: the bank
redirected the browser there, the React app exchanged the code with a session
and a CSRF token, and the user had to be signed in *on that origin*. That made
the flow fragile in exactly the case a self-hosted deployment produces — the app
reached on `localhost` while the registered redirect address is a Tailscale or
LAN hostname — and it meant a callback landing anywhere else had to be copied
and pasted back into Settings.

Actual Budget's Enable Banking integration solves this the other way around: the
sync server owns `/enablebanking/auth_callback`, answers it with a small HTML
page that only needs the single-use `state`, and the app window that started the
flow **polls** until the handshake completes. The callback page needs no session
at all.

## Decision

- `GET /enablebanking/auth_callback` is a server route, registered outside the
  session/CSRF guard. The single-use `state` in the URL is the credential: it is
  256 bits of randomness, stored inside the vault, bound to one pending link and
  valid for fifteen minutes.
- The route exchanges the code, stores the bank session, marks the link
  authorized and answers with a plain HTML page ("… is connected"), served with
  its own strict CSP that allows only one hashed inline script to close the
  window. It needs an **unlocked vault**, not a session; when the vault is
  locked it answers 423 and tells the reader to unlock Flowly and paste the
  address into the bank panel.
- A refusal from the bank (`error=access_denied`, …) and a failed exchange mark
  the pending link `failed` with the reason, so the panel that is polling stops
  waiting and shows why instead of a link stuck on "waiting".
- The panel opens the bank in its own window and keeps polling the banking
  status; "open it in this tab instead" and the paste field stay as fallbacks.
- The shell keeps its `/enablebanking/auth_callback` route as a fallback for
  setups where the bundle is served without the API route in front of it (Vite
  in development), the same belt-and-braces Actual ships.

## Consequences

- The bank can return to any address that reaches this server: the handshake no
  longer depends on which origin the person was using, and the address only has
  to be reachable, not signed in.
- A locked vault turns the callback into an instruction instead of an error: the
  `code` stays valid long enough to paste it, and the same route completes it
  afterwards.
- The callback is now a GET that changes state. It is not CSRF-able in the usual
  sense: an attacker cannot forge a `state`, replay one, or gain anything from a
  completion, because the flow only ever finishes a link the owner started.
- Two entry points complete a handshake (this route and the authenticated POST
  used by the paste fallback); both go through
  `BankingService.completeAuthorization`, so the state, expiry and single-use
  rules cannot drift apart.
