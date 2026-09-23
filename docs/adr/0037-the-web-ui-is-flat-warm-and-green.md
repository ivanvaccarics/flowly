# ADR 0037 — The web UI is flat, warm and green

Status: Accepted (2026-09-23). Supersedes the *visual* decisions of
[ADR 0028](./0028-every-section-opens-with-a-banner.md) on the dashboard and
repaints [ADR 0023](./0023-flowly-brand-lockup-and-palette.md)'s lockup flat in
the chrome; the period scoping of
[ADR 0035](./0035-the-dashboard-is-scoped-by-the-period-alone.md) and the
checks of [ADR 0028](./0028-every-section-opens-with-a-banner.md) on the five
other sections stand.

> **Update (2026-09-23, later the same day).** Two corrections from using it.
> The chrome keeps the **real lockup**: `logo.svg` as it is, gradient tile and
> all, at 30 px in the sidebar and 34 px on the unlock card — the flat chrome
> tile and `logo-wordmark.svg` are gone, and `--brand` / `--primary` are
> `#1e6f4e` again rather than the mockups' `#277b62`, so the product's green is
> the one the logo is drawn with. The content column also widens from 1240 px to
> 1560 px: on a wide screen the page read as a centred strip. The warm surfaces,
> the serif headline, the dashboard's layout and the mockups' semantic accents
> stand.

## Context

The interface had grown a cool slate canvas, a tinted sidebar, a gradient tile
in the chrome, a tinted banner on every section and a top bar that printed the
section title, the breadcrumb and the clock. The new desktop mockups — the
dashboard and the lock screen — ask for something quieter and warmer: a canvas
that reads as paper rather than as slate, one flat green for the product's own
actions, one filled card that carries the balance, a serif that appears only
where the product speaks a full sentence, and a compact period control instead
of a bar that prints every month of a year.

The dashboard also showed four equal figures per currency and no single answer
to "what do I have": the balance sat in a metric strip with the income, the
expenses and the net flow, and the page opened with a banner about the vault
rather than with a sentence about the money.

## Decision

- **The palette is the mockups' palette, in Flowly's green.** Warm off-white
canvas (`#f7f8f5`), warm white cards (`#fffefb`), a hairline `#e1e8e3`, ink
`#203032`, and the brand green `#1e6f4e` for primary actions, the active
navigation pill and the filled balance card. Inflows are `#1f7a58`, outflows a
muted `#a8515d`, and the engine keeps its violet. `docs/DESIGN.md` carries the
table.
- **The dashboard opens with a sentence, not a banner.** The date, the hour's
  greeting in the page's serif, one line about what the page shows, and the
  period control — the banner and the intro pair stays on the five other
  sections, with the same flat card and the same serif headline.
- **Three metric cards, one of them filled.** The balance across accounts is the
  page's single green surface, with the period's net flow and the savings rate;
  what was spent and what came in sit beside it. The dashboard's cards then
  follow the mockups' grid: the cash-flow chart and the recent movements take
  two columns, the bank card and the spending donut take one, and the accounts
  summary closes the page.
- **The period picker is compact.** A trigger naming the period in words and a
  calendar button open the existing picker over the page. The scoping itself is
  untouched — the months are still the dashboard's only scope (ADR 0035) — and
  choosing a preset closes the picker again.
- **The shell states the vault, and the section names itself.** The top bar
  carries an **Encrypted locally** chip, the hour the vault was opened and the
  **Backup vault** action; the page's `h1` is read by assistive technology and
  no longer printed, because the active sidebar item and each page's headline
  already name the section. The sidebar's foot holds the session card with the
  two lock controls, which is where a session-level action belongs.
- **The chrome wears the Flowly lockup.** `logo.svg` — the gradient tile with the
  wordmark — is what the sidebar and the unlock card show, at 30 px and 34 px.
- **The lock screen states the door, not the engine.** The lockup, the hour's
  greeting, a serif **Welcome back.**, the passphrase field with its reveal
  button, the **Unlock vault** action and two trust statements. The storage
  engine stays out of it, as the shell's own tests require.
- **The six sections keep their names.** The mockups show three navigation
  items; the product has six sections, each with tests and documentation behind
  it. The redesign restyles the chrome, it does not remove a section.

## Consequences

- `apps/web/src/styles.css` carries the new token values and the new chrome,
  dashboard and unlock rules; `apps/web/src/components/AppShell.tsx` and
  `UnlockScreen.tsx` are rebuilt around them, and `DashboardView.tsx` gains the
  header, the metric cards, the movement list and the backup strip.
- `docs/DESIGN.md` is rewritten where the language changed — character, brand,
  tokens, typography, layout, the dashboard's components and the lock screen —
  and `docs/TESTING.md` follows the moved controls.
- The README screenshots are regenerated at 1440 px wide (the dashboard at
  2100 px tall, because the page is long); `tooling/scripts/screenshots.mjs`
  knows the new selectors and opens the period picker for its trend preset.
- The web tests are updated where the copy moved: the lock screen's heading and
  label, and the dashboard's export shortcut.
- Nothing about what the product stores, computes or exports changes; this is a
  presentation decision, and the figures on it are the same figures.
