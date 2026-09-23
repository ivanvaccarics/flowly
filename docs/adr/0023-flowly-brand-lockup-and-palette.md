# ADR 0023 — Adopt the Flowly lockup and its green-and-gold palette

Status: Accepted (2026-09-18)

The icon list below is superseded in part by
[ADR 0032](./0032-flowly-targets-the-desktop-only.md): the iOS touch icon was
removed with the mobile target, so the assets are SVG only.

The chrome now paints the lockup flat — a solid brand-green tile and
`logo-wordmark.svg` in ink — while the gradient lockup below stays the published
asset: [ADR 0037](./0037-the-web-ui-is-flat-warm-and-green.md).

Supersedes the brand and accent-colour decisions of
[ADR 0021](./0021-slate-and-teal-ui-with-dashboard-pie-chart.md) and the tag
palette added by [ADR 0022](./0022-italian-number-formatting-and-palette-colour-picker.md).

## Context

Flowly shipped with a placeholder identity: three nested "flow" leaves in mint
teal (`#0f766e` → `#2dd4bf`), a wordmark set in live text, and a UI accent taken
from the same teal. That mark said nothing about a vault, and its colours came
from the mockups rather than from the product.

The brand exists now: a white keyhole knocked out of a squircle, the rounded
`Flowly` wordmark beside it, and three colours —

- `#0b3d2e`, deep green,
- `#1e6f4e`, medium green,
- `#d4af37`, gold —

with the gradient running from the deep green through the medium green to the
gold. The artwork arrives as a traced SVG (a local, untracked reference next to
the mockups): eleven filled paths, gradients approximated from a raster, a C2PA
manifest in `<metadata>`, and no text element.

## Decision

- **The uploaded lockup is the brand.** The keyhole tile and the wordmark
  replace the leaves everywhere the product shows itself: the sidebar tile, the
  unlock card, the browser tab, the iOS icon and the README.
- **Three colours, one gradient.** `#0b3d2e` → `#1e6f4e` → `#d4af37` runs left to
  right through the wordmark and top-left to bottom-right through the tile, and
  stops at 55 % on the medium green. The same three values become the
  `--brand-deep`, `--brand`, `--brand-gold` and `--brand-gradient` tokens, and
  the browser `theme-color` is the deep green.
- **The teal is retired from the product's own surfaces.** Primary actions,
  focused fields, the active navigation icon, the account dot, the progress bar,
  the switch's on-state, the focus halo and the default tag colour all move to
  the brand green; the semantic colours (emerald inflows, red outflows, violet
  engine, amber warnings, blue focal figures) are untouched, because they carry
  meaning rather than identity.
- **Gold never carries text.** On white it reaches about 2.1:1, so it is a fill,
  a chip tint and a chart slice — never a label, never a button face. A tag
  coloured gold still reads: `tagPillStyle` mixes its text toward `--text`.
- **The gradient is spent where the brand speaks.** The sidebar tile and the
  progress bar carry it; the unlock card gets a two-colour wash behind the card.
  Cards, tables, buttons and chrome stay flat, so the "quiet, sovereign"
  character of ADR 0021 survives the rebrand.
- **The wordmark ships as outlines.** It is no longer live text, so the mark no
  longer depends on a local font stack — the outline is what the artwork drew,
  and a private network without a CDN is a first-class target. The lockup loses
  its tagline with it: the unlock card states the tagline as its lead paragraph,
  where a screen reader meets it once, and the asset is labelled "Flowly".
- **The assets are re-cut, not pasted.** The C2PA manifest is dropped, the
  viewBox is cropped to the artwork, the ids are prefixed, the letters share one
  gradient, and the tile is painted through a mask — its two traced halves minus
  the keyhole — so the knockout keeps a crisp edge instead of the seam and halo
  the raw trace produces. `logo-mark-mono.svg` stays the white keyhole for dark
  or tinted surfaces, which is what the CSS sidebar tile knocks into itself.
- **Two of the eight tag swatches become brand colours.** `#1e6f4e` "Flowly
  green" and `#d4af37` "Gold" replace "Teal" and "Mint", and a tag created
  without a colour is shown in the brand green (`DEFAULT_TAG_COLOR` in
  `apps/web/src/lib/tags.ts`) instead of the retired teal.

## Consequences

- `docs/DESIGN.md` documents the new Brand section (the three colours, where
  each one lands, the five assets and the mask), the re-tokenised accent rows
  and the updated components; `docs/PLAN.md` §6.5 and the new
  `rebrand-to-the-flowly-lockup` task record the change; the README header and
  its design paragraph follow.
- Tags already stored with the old teal keep it: colours are user data now, and
  nothing rewrites a vault.
- The rebrand is presentation only. No API, contract, migration or dependency
  changes; the assets remain static files in `apps/web/public` with no build
  step.
- The new lockup is wider and shorter than the old one (about 3.4:1 against
  4:1), so `.logo-lockup` renders 228 × 66 px on the unlock card and the README
  header image is 340 px wide.
