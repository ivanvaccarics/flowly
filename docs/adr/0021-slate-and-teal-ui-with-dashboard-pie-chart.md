# ADR 0021 — Retheme the web UI to the slate and teal mockups, and chart spending as a pie

Status: Accepted (2026-09-16)

Supersedes the palette, shape, page-header and panel decisions of
[ADR 0012](./0012-align-web-ui-with-sovereign-ledger-mockups.md).

The spending pie decided below is scoped by
[ADR 0033](./0033-the-dashboard-is-scoped-by-months-and-tags.md) and kept as the
breakdown's shape by
[ADR 0034](./0034-the-spending-breakdown-stays-a-donut.md), where its legend is
the tag filter.

## Context

ADR 0011 and ADR 0012 built the web client on the first set of mockups in `ui/`:
a lavender canvas (`#faf8ff`), tinted `#f2f3ff` panels, borderless white cards
under soft shadows, an indigo (`#4648d4`) primary, and a hero card that repeated
the section title inside the content column.

The mockups in `ui/` have since been redrawn: a cool slate canvas (`#f8fafc`),
a tinted `#f1f5f9` navigation rail, white cards with a hairline `#e2e8f0`
outline and a 16 px radius, a teal primary (`#0d9488`/`#0f766e`), pill-shaped
chips, and the section title moved into the top bar next to a green vault-state
pill, a local clock and a soft-red session button. The dashboard also gains a
circular share chart where the previous revision drew a stacked bar.

## Decision

- **The new mockups are the reference.** `apps/web/src/styles.css` carries their
  tokens and `docs/DESIGN.md` is the tracked summary of them; the `ui/` folder
  stays an untracked local reference with no build or runtime dependency.
- **Hairlines instead of shadows.** Cards are white with a 1 px `--border`
  outline, a 16 px radius and `--shadow-1`; tinted `--surface-low` panels hold
  nested content, and inputs inside those panels switch to white.
- **One accent, used sparingly.** Teal marks the product's own actions (primary
  buttons, active navigation, focus rings, progress); emerald is inflows, red is
  outflows and destructive actions, violet is engine-level information, amber is
  a warning, blue is the focal figure of a metric row.
- **The page title moves to the top bar.** The shell owns the single `h1` per
  screen and each view points its `aria-labelledby` at it, so sections open with
  a summary card instead of repeating their name. The bank-callback screen, which
  renders outside the shell, keeps its own `h1`.
- **Accessibility beats the mockup pixel.** Where the mockup colour carries text
  and would miss WCAG AA (emerald, red, teal, violet on white), the token is one
  step darker; chart fills, dots and icons keep the mockup values. The contrast
  contract of ADR 0011 is unchanged.
- **The spending breakdown is a pie chart.** One hand-rolled SVG donut per
  currency — arcs sized by tag share, the period total in the hole, the legend
  rows below — replacing the stacked share bar. Spending is still grouped per
  currency, so no chart ever totals unlike currencies.
- **Nothing is invented.** No global top-bar search (free-text search stays in
  the ledger filters), no session countdown (the API exposes no remaining time;
  the top bar shows the local clock instead), no user avatar, no theme switch and
  no illustrative identifiers the API does not return.

## Consequences

- `docs/DESIGN.md` was rewritten around the new tokens, layout and components;
  ADR 0011's accessibility, no-webfont and "render only implemented features"
  decisions and ADR 0012's hero, card and "nothing is invented" decisions still
  stand.
- The sidebar brand is the Flowly mark in white inside a CSS gradient tile, and
  `favicon.svg` and `apple-touch-icon.png` adopt the same tile; the product mark
  itself is unchanged.
- Tag colours picked before this revision stay valid — they are stored values —
  while the create form's palette and the fallback colour now come from the new
  tokens.
- No new runtime dependency was added: the pie chart, the clock and the tiles are
  hand-rolled SVG, CSS and a 30-second interval.
