# ADR 0011 — Adopt the Sovereign Ledger UI design system

Status: Accepted (2026-09-11)

## Context

The React client grew screen by screen: a locked shell, then panels for accounts,
transactions, tags, rules and import/export. Navigation was a row of tabs, styling
was ad hoc, and change-passphrase sat in a footer visible on every page. A design
language already existed in the repository (`ui/sovereign_ledger` plus four
desktop mockups) but had never been applied.

## Decision

- **Adopt the repository's design system.** Tokens, typography, spacing, shapes,
  table density, chips and button hierarchy come from the `ui/` design
  specification and mockups (a local, untracked reference);
  `apps/web/src/styles.css` holds them as CSS custom properties and
  `docs/DESIGN.md` is the tracked summary, so the project does not depend on a
  folder Git ignores.
- **No webfont CDN and no icon font.** The app must work with no Internet access,
  so Manrope/Inter/JetBrains Mono are declared with local fallbacks and icons are
  inline SVG. Nothing is fetched at runtime.
- **Navigation is a sidebar, not tabs.** One shell with six sections; the active
  section is marked with `aria-current="page"`.
- **Render only implemented features.** The mockups show charts, budgets and
  savings-rate widgets that the product cannot compute; they are deliberately
  absent instead of faked.
- **Settings replaces the import/export tab.** Passphrase change, export (CSV and
  archive) and import (CSV merge, archive replacement) live together under
  `Settings`. The footer passphrase form was removed from every screen.
- **Keep the accessibility contract.** Single `h1` per screen, every field
  labelled, buttons with accessible names, `aria-current` navigation, live-region
  banners for errors and confirmations, keyboard-reachable controls.

## Consequences

- The UI now matches the documented design language, and future screens have
  tokens to build on instead of new ad-hoc CSS.
- Anyone with the three fonts installed sees the intended typography; everyone
  else gets a close system fallback. Self-hosting the fonts later is a drop-in
  change.
- Charts are absent. If cash-flow charts are wanted, that is a product decision
  with a new dependency or a hand-rolled SVG, not a styling task.
- The mockups in `ui/` stay as reference material; they are not built or served.
