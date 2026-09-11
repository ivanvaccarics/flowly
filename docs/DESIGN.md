# Flowly UI design system

The interface follows **Sovereign Ledger**, the design language captured in the
repository's `ui/` folder (a design specification plus desktop mockups of the
dashboard, accounts, transactions, vault and rules screens). That folder is a
local, untracked reference — the tokens and rules that matter are reproduced here
and implemented in `apps/web`, so the codebase is self-contained and this
document is the authoritative summary for anyone cloning the repository.

## Character

High-trust, sovereign and quiet: pure white cards floating over a soft lavender
canvas, soft ambient shadows instead of hard borders, dense tabular structures,
restrained feedback and precise typographic contrast. No gradients, no
decorative noise, no dark-mode inversion.

## Brand

The Flowly mark is three nested "flow" leaves with a folded underside, drawn as
SVG and served from `apps/web/public`:

| Asset | Use |
| --- | --- |
| `logo-mark.svg` | The mark alone, transparent, for light surfaces |
| `logo.svg` | Horizontal lockup: mark, the `Flowly` wordmark and the tagline; used on the unlock card |
| `favicon.svg` | Rounded dark tile with the mark; browser tab and the sidebar brand |
| `apple-touch-icon.png` | 180 px full-bleed square of the same tile for iOS home-screen bookmarks |

Colours come from the platform tokens: the leaves run from `--secondary`
`#006c49` to the mint `#6cf8bb` with the fold in `#005236`, the wordmark uses
`--text` `#131b2e` and the tagline `--text-muted`. The lockup is drawn for light
surfaces; on dark surfaces use the mark or the tile. The wordmark is live text in
the SVG, so it follows the same local font stack as the rest of the interface.

## Tokens

Defined once as CSS custom properties in `apps/web/src/styles.css`. The values
come from the Material-style token block at the top of
`ui/sovereign_ledger/DESIGN.md`, which is what the mockups were built from.

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#faf8ff` | Application background |
| `--surface` | `#ffffff` | Cards, tables, popovers |
| `--surface-low` | `#f2f3ff` | Tinted panels: ribbons, fieldsets, list rows, option cards |
| `--surface-sunken` | `#eaedff` | Chips, active navigation pill, icon tiles, segmented control |
| `--surface-high` | `#e2e7ff` | Badge inside the vault state pill |
| `--border` / `--border-strong` | `#e8e7f4` / `#c7c4d7` | Table rows and dashed dropzones / dashed outlines, dividers |
| `--text` / `--text-secondary` / `--text-muted` | `#131b2e` / `#464554` / `#767586` | Headlines and figures, body, metadata |
| `--primary` / `--primary-hover` | `#4648d4` / `#3a3cbe` | Primary actions, active navigation, focused fields |
| `--primary-soft` / `--primary-ink` | `#e1e0ff` / `#2f2ebe` | Tag pills, vault chips, icon tiles |
| `--income` | `#006c49` | Inflows, confirmations, "zero-telemetry" states |
| `--expense` | `#b90538` | Outflows, destructive actions, errors |
| Radius | 4 px / 8 px / 12 px | Badges and tag pills / controls / cards and modals |
| Shadow | level 1–3 | Cards, hover and popovers, modal and unlock card |

Panels use `--shadow-1` (`0 1px 8px rgba(19, 27, 46, 0.04)`) rather than a
visible outline; typography and figure alignment carry the structure. Circular
elements are reserved for avatars, status dots, switches and swatches.

## Typography

- **Display (Manrope):** page titles and section headings.
- **Body (Inter):** controls, prose, table cells.
- **Data (JetBrains Mono):** every monetary amount, date, currency code, vault id
  and schema version, so figures stay vertically aligned.

**No webfont CDN.** Flowly runs on a private network with no Internet access, so
the families are declared with local fallbacks (`SF Pro`, `Segoe UI`, system
fonts). Where Manrope, Inter or JetBrains Mono are installed the intended look is
reproduced exactly; otherwise the closest system face is used and the layout does
not shift.

## Layout

- Fixed 260 px white sidebar: brand, a "Vault navigation" label, the six
  sections, and a footer card showing the local vault identity (storage engine
  and schema version) instead of a user account.
- Sticky 64 px top bar: the vault state pill (pulsing dot, engine and schema, an
  `AES-256` badge), the short vault id, and the session controls.
- Content column capped at 1600 px with 24 px gutters; cards carry 24 px internal
  padding.
- Below 1024 px the sidebar becomes a horizontal, wrapping nav, the top bar wraps
  and cards stack.

## Components

- **Page header (hero):** every section opens with a white card holding an
  uppercase eyebrow, the `h1`, an optional lead paragraph, right-aligned status
  chips and actions, and an optional sunken **ribbon** of key figures.
- **Metric card:** eyebrow with an icon tile, a monospaced value, and a delta or
  context chip.
- **Panel:** tinted `#f2f3ff` block used for form fieldsets, ribbons, list rows
  and option cards. Inputs inside a tinted panel switch to white so they stay
  legible.
- **Data table:** uppercase micro-headers on a tinted row with rounded ends,
  44 px rows, hover tint, right-aligned monospaced amounts, coral for outflows
  and emerald for inflows.
- **Account card:** icon tile, name, type and currency, status chips and a tinted
  balance block with the booked-movement count.
- **Rule tile:** name, an on/off switch, the matched expression in monospace and
  the tags it applies.
- **Option card:** one export or import method with its explanation, controls and
  a dashed dropzone.
- **Status chip:** compact 2/8 px padding with tone variants (`income`, `expense`,
  `vault`, `neutral`); `meta` and `mono` variants cover uppercase and hashed data.
- **Tag pill:** monospaced pill tinted with the tag colour. The ledger shows the
  plain tag name and reuses the pill as a quick filter button (filled indigo when
  active); the rule tiles prefix `#` because there the tag reads as part of the
  expression a rule applies.
- **Colour picker:** eight palette swatches from the design tokens rendered as a
  radiogroup (a ring plus a check marks the selection), with a monospaced
  `#rrggbb` field beside it so any colour stays reachable. No native colour
  wheel. Shared by the create form and the inline tag editor.
- **Switch:** 40×22 px on/off control for pausing a tagging rule.
- **Tag picker:** a compact trigger that summarises the selection (up to two tag
  pills plus a `+N` counter) and opens a popup with a search field, a scrollable
  checklist and `Clear` / `Done` actions. Used wherever tags are chosen, so a
  vault with hundreds of tags never inflates a table row or a form.
- **Buttons:** primary indigo (36 px, radius 8), ghost secondary, destructive
  coral-outline that only fills on an explicit destructive action.
- **Inputs:** 36 px, tinted on white cards and white on tinted panels, indigo
  focus ring with a soft halo.
- **Banner:** inline feedback for errors, confirmations and loading.

## Mapping to implemented features

Only shipping functionality is on screen; every figure comes from the API.

| Section | Contents |
| --- | --- |
| Dashboard | Hero with the vault engine and vault id, segmented period control (month / 3 months / year / custom), Export data and New transaction shortcuts, four metric cards per currency (total balance, income, expenses, net + savings rate) with deltas against the previous equal-length period, cash-flow chart (weekly income/expense bars with a net line, inline SVG), spending breakdown with a stacked share bar and percentages, average daily spend, recent transactions table, accounts summary and the local vault status card |
| Accounts | Hero with the account and currency counts, create form, and one card per account with its real balance per currency and booked-movement count, archive, restore an archived account, and cascade delete |
| Transactions | Hero with the match count, record form (notes, tag picker, status), server-side filters (text, account, tag, status, date range), quick tag-filter pills, and a table with inline editing of **payee, amount, note and tags**, a status chip that switches booked ↔ pending, the source shown as an offline-AES chip, and delete |
| Tags | Hero with the tag count, create with a palette colour (or a custom hex value), **inline rename and recolour** of an existing tag, and cascade delete |
| Rules | Hero with the rule counts and the backfill action, condition builder (AND/OR, per-field operators, amount currency), tag selection, and a side column of rule tiles with an on/off switch, the matched expression and delete |
| Settings | Hero with the cipher and zero-cloud chips, passphrase change, and paired export and import option cards: transaction CSV, complete encrypted archive, CSV preview and merge, archive replacement |

The mockup's global search field is **deliberately left out of the header**:
free-text search lives in the Transactions filters, next to the other query
controls, so there is one place to search the ledger instead of two. If a global
search comes back later, it should reuse the same server-side query endpoint.

Deliberately absent because the product does not have them: the session timeout
countdown (no remaining-time value is exposed by the API), the user avatar and
account identity (Flowly has no accounts or users), transfer/top-up actions,
filtered exports, the ledger checksum chip and the mockups' illustrative node
identifiers.

The vault lock screen uses the same language: centered card, lock badge,
passphrase field, the no-recovery warning, and a tinted facts row with state,
storage engine and vault format.
