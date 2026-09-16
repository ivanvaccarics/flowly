# ADR 0012 — Align the web UI with the Sovereign Ledger mockups

Status: Accepted (2026-09-11)

Supersedes the palette and panel decisions of
[ADR 0011](./0011-ui-design-system.md).

Palette, shape, page-header and panel decisions superseded by
[ADR 0021](./0021-slate-and-teal-ui-with-dashboard-pie-chart.md).
The "no native colour wheel" rule is superseded by
[ADR 0022](./0022-italian-number-formatting-and-palette-colour-picker.md).

## Context

ADR 0011 adopted the Sovereign Ledger design system, but the first pass
implemented the palette from the prose section of `ui/sovereign_ledger/DESIGN.md`
(`#f8fafc` canvas, `#e2e8f0` hairlines, `#6366f1` primary), while the mockups in
`ui/*` were built from the Material-style token block at the top of that same
file (`#faf8ff` canvas, `#f2f3ff`/`#eaedff` containers, `#4648d4` primary).

The screens therefore drifted from the reference in five ways: cards carried a
visible hairline border instead of a soft shadow, every page started with a bare
title instead of the mockups' header block, accounts and settings were still flat
tables and fieldsets, rules had no on/off switch, and the transactions filters
had no quick tag row.

## Decision

- **The token block is authoritative.** Colour and shape values come from the
  Material-style tokens in `ui/sovereign_ledger/DESIGN.md`; the hex values in its
  prose are illustrative. `docs/DESIGN.md` lists the mapped tokens.
- **Cards are white, borderless and soft.** 12 px radius with
  `0 1px 8px rgba(19, 27, 46, 0.04)`; tinted `#f2f3ff` panels hold nested
  content, and inputs inside those panels switch to white so they stay legible.
- **Every section opens with a hero card.** Eyebrow, `h1`, optional lead,
  right-aligned status chips and actions, and an optional sunken ribbon of key
  figures. Section titles follow the mockups' naming.
- **Screens are rebuilt to the mockups' shape where the data exists.** Accounts
  become endpoint cards with real balances and booked-movement counts, rules
  become tiles with an on/off switch, settings groups export and import into
  option cards with dropzones, and the transactions filter panel gains quick
  tag-filter pills.
- **Nothing is invented.** No global header search (free-text search stays in the
  ledger filters), no session countdown, no user avatar, no checksum chip, and no
  illustrative identifiers that the API does not return.

## Consequences

- `docs/DESIGN.md` was rewritten around the implemented tokens and components;
  ADR 0011's accessibility, no-webfont and "render only implemented features"
  decisions still stand.
- The mockups in `ui/` stay a local, untracked reference: the app has no runtime
  or build dependency on that folder.
- No new runtime dependency was added — the charts, switches, ribbons and pickers
  are hand-rolled CSS and inline SVG.
