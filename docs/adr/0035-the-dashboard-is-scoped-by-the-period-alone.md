# ADR 0035 — The dashboard is scoped by the period alone, and the shell keeps no vault chrome

Status: Accepted (2026-09-23). Supersedes the tag scoping of
[ADR 0033](./0033-the-dashboard-is-scoped-by-months-and-tags.md) and the
checkbox legend of
[ADR 0034](./0034-the-spending-breakdown-stays-a-donut.md); the monthly chart
and the donut itself stand.

## Context

ADR 0033 and ADR 0034 gave the dashboard two scopes at once: a set of months and
a set of tags switched on and off in the spending legend. Reading the page then
meant reading a definition: an arc was "this tag, among the ones that happen to
be ticked", the totals behind it recomputed as the ticks changed, and a figure
the reader wanted to compare with the month before it depended on a checkbox
somewhere further down. The question the dashboard answers — where did the money
go in this period — was being asked in halves, and the second half was a
reconstruction the reader had to do in their head.

The chrome had collected the same kind of noise. The top bar carried a
**Vault unlocked** pill with an `AES-256` badge and the short vault id, and the
sidebar ended in a **Local vault · Encrypted at rest** card: three statements
about the vault's internals, none of them about the money on screen, and the
vault id in particular reads like a commit hash to anyone who has used a
terminal.

## Decision

- **The period is the dashboard's only scope.** The month picker stays exactly
  as it is — preset, year strip, month grid, removable chips — and the KPI row,
  the cash-flow chart, the donut and the recent movements all describe every
  category of those months. The web client asks `GET /api/dashboard` for
  `months` alone, and the ledger search behind the recent card carries no `tags`
  either, so the figures and the rows behind them agree by construction.
- **The spending legend is a read-out, not a filter.** One donut per currency,
  an arc per tag of the period, and a row per tag with its colour, name, amount
  and share. The row is a button that opens the ledger on that tag; there is no
  checkbox, no **Include all** and no dimmed state, because there is nothing to
  exclude. Hovering or focusing a row still reads the tag out in the hole.
- **The endpoint keeps the capability the client stops using.**
  `GET /api/dashboard` still accepts `tags`, and the ledger search still accepts
  `months` and `tags`; a future native client or a deliberate filtered view can
  ask for them without an API change. The web dashboard simply never does.
- **The shell keeps no vault chrome.** The top bar's state pill (`Vault
  unlocked`, `AES-256`) and the short vault id are removed, and so is the
  sidebar's footer card. The top bar keeps the section title, the clock and the
  session controls; the vault's state, format and encryption are stated where
  they belong — the unlock screen and Settings.

## Consequences

- `apps/web/src/views/DashboardView.tsx` no longer holds `excludedTags`,
  `periodTagIds` or a tag argument on either request, and `SpendingPie` loses
  its checkbox legend; the responsive and legend CSS that served them goes with
  them.
- The shell drops the `status` prop it only used for the vault id, so `App.tsx`
  stops passing it.
- ADR 0033 keeps the month-set period, the monthly chart and the endpoint's
  `months` scope; its tag scoping and ADR 0034's checkbox legend are superseded
  here. `docs/DESIGN.md`, `docs/PLAN.md`, `docs/TESTING.md` and `README.md`
  describe the single scope and the chrome without the vault badges; the README
  screenshots are regenerated.
