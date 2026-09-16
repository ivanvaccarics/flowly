# Flowly UI design system

The interface follows **Sovereign Ledger**, the design language captured in the
repository's `ui/` folder (desktop mockups of the dashboard, ledger, accounts,
rules, vault and settings screens). That folder is a local, untracked reference
— the tokens and rules that matter are reproduced here and implemented in
`apps/web`, so the codebase is self-contained and this document is the
authoritative summary for anyone cloning the repository.

## Character

High-trust, sovereign and quiet: white cards with a hairline outline over a
cool slate canvas, a tinted sidebar, one accent colour used sparingly, dense
tabular structures and precise typographic contrast. No gradients in the
interface chrome, no decorative noise, no dark-mode inversion. Colour only
enters where it carries meaning: teal for the product's own actions, emerald for
inflows, red for outflows and destructive actions, violet for engine-level
information.

## Brand

The Flowly mark is three nested "flow" leaves with a folded underside, drawn as
SVG and served from `apps/web/public`:

| Asset | Use |
| --- | --- |
| `logo-mark.svg` | The mark alone, transparent, for light surfaces |
| `logo-mark-mono.svg` | The mark in white, for dark or tinted surfaces; the sidebar brand tile |
| `logo.svg` | Horizontal lockup: mark, the `Flowly` wordmark and the tagline; used on the unlock card |
| `favicon.svg` | Rounded teal-gradient tile with the mark; browser tab |
| `apple-touch-icon.png` | 180 px full-bleed square of the same tile for iOS home-screen bookmarks |

The leaves run from the deep green `#0f766e` to the mint `#2dd4bf`, the wordmark
uses `--text` `#0f172a` and the tagline `--text-muted`. The sidebar renders the
mono mark inside `.brand-tile`, a CSS gradient tile, so the tile follows the
theme without another asset. The lockup is drawn for light surfaces; on dark
surfaces use the mono mark or the tile. The wordmark is live text in the SVG, so
it follows the same local font stack as the rest of the interface.

## Tokens

Defined once as CSS custom properties in `apps/web/src/styles.css`, taken from
the mockups' palette (a slate neutral ramp with teal, emerald, red, amber, blue
and violet accents).

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#f8fafc` | Application background behind the cards |
| `--surface` | `#ffffff` | Cards, tables, popovers, top bar |
| `--sidebar` | `#f1f5f9` | The navigation rail |
| `--surface-low` | `#f8fafc` | Fieldsets, ribbons, list rows, option cards, inputs |
| `--surface-sunken` | `#f1f5f9` | Chips, icon tiles, control tracks, table hairlines |
| `--border` / `--border-strong` | `#e2e8f0` / `#cbd5e1` | Card outlines, row dividers, dashed dropzones |
| `--text` / `--text-secondary` / `--text-muted` / `--text-faint` | `#0f172a` / `#475569` / `#64748b` / `#94a3b8` | Headlines and figures, body, metadata, placeholders |
| `--primary` / `--primary-hover` | `#0f766e` / `#115e59` | Primary actions, active segment, focused fields |
| `--primary-soft` / `--primary-ink` | `#ccfbf1` / `#0f766e` | Vault chips, icon tiles, tag pills |
| `--accent` | `#0d9488` | Active navigation icon, progress bars, focus rings |
| `--income` / `--income-graphic` / `--income-soft` | `#047857` / `#10b981` / `#d1fae5` | Inflow text / chart bars and dots / chips and tiles |
| `--expense` / `--expense-graphic` / `--expense-soft` | `#dc2626` / `#ef4444` / `#fee2e2` | Outflow text / chart bars / chips and destructive buttons |
| `--info` / `--info-graphic` / `--info-soft` | `#7c3aed` / `#8b5cf6` / `#ede9fe` | Engine-level banners and chips |
| `--warning` / `--warning-soft` | `#b45309` / `#fef3c7` | Sovereign-warning banners |
| `--accent-blue` / `--accent-blue-soft` | `#1d4ed8` / `#dbeafe` | The focal figure of a metric row |
| Radius | 6 px / 10 px / 16 px / pill | Micro controls / inputs and buttons / cards and panels / chips |
| Shadow | level 1–3 | Cards, hover and popovers, modal and unlock card |

Colour pairs that carry text are one step darker than the mockups where the
mockup value would miss WCAG AA on white (`--income`, `--expense`, `--primary`,
`--info`); chart fills, dots and icons keep the mockup values exactly.

## Typography

- **Display (Manrope):** the page title in the top bar, section headings, metric
  values, ribbon figures and chart centres.
- **Body (Inter):** controls, prose, table cells.
- **Data (JetBrains Mono):** vault ids, hashes, provider payloads, dates in the
  ledger and the percentages beside a chart legend. Money is set in the display
  face with `font-variant-numeric: tabular-nums`, so columns still align while
  the figures read as prose rather than code.

**Numbers are written the Italian way:** a dot groups thousands and a comma
separates the decimals (`1.234,56`), with the currency code after the amount and
the currency's own number of decimals (`1.234` for JPY, `1,234` for BHD). Rates
and shares follow the same comma. This is presentation only: the vault stores
signed integer minor units, the API speaks ISO dates and canonical decimals, and
every export stays canonical, so the figures round-trip. The amount fields accept
either convention — `1.234,56` and `1,234.56` both land on the same value.

**No webfont CDN.** Flowly runs on a private network with no Internet access, so
the families are declared with local fallbacks (`SF Pro`, `Segoe UI`, system
fonts). Where Manrope, Inter or JetBrains Mono are installed the intended look is
reproduced exactly; otherwise the closest system face is used and the layout does
not shift.

## Layout

- Fixed 258 px tinted sidebar, separated from the content by a hairline: brand
  tile and wordmark, the six sections, and a footer card showing the local vault
  identity instead of a user account. The active section is a white pill with a
  hairline outline and a teal icon.
- Sticky 64 px white top bar carrying the current section's `h1`, the vault state
  pill (pulsing dot, an `AES-256` badge), the short vault id, the local clock, and
  the session controls (Export data, Lock session, Lock all). **Export data** is
  a deep link: it opens Settings, scrolls the export block into view and puts
  focus on it.
- Content column capped at 1600 px with 32 px gutters; cards carry 24 px internal
  padding and a 20 px gap inside a grid.
- Below 1024 px the sidebar becomes a horizontal, wrapping nav, the top bar wraps
  and cards stack.

## Components

- **Top bar title:** the single `h1` of every screen lives here, and each view
  points its `aria-labelledby` at it. Sections therefore open without repeating
  their own name.
- **Hero:** the summary card a section opens with — an uppercase eyebrow, an
  optional card heading (`h2`), a lead paragraph, right-aligned status chips and
  actions, and an optional **ribbon** of key figures. Rules uses the violet
  `hero info` variant for engine-level information.
- **Metric card:** eyebrow with an icon tile, a large tabular value, and a delta
  or context chip. The focal card of the row (for example net flow) uses the blue
  `metric lead` variant.
- **Panel:** tinted `#f8fafc` block with a hairline, used for form fieldsets,
  ribbons, list rows and option cards.
- **Data table:** uppercase micro-headers over a hairline, 44 px rows, hover tint,
  and an amount column that is right-aligned as a column — header included — so
  the figures line up on their last digit in the display face, red for outflows
  and emerald for inflows. Dates never wrap, and a row's Raw/Edit/Delete buttons
  stay on one line: the ledger scrolls sideways instead of pushing the actions
  under the row. The row's second line names where it came from (the bank's own
  description, or the source); a provider's raw row id lives only behind **Raw**.
- **Pie chart:** the dashboard's spending breakdown, one SVG donut per currency,
  each arc an `--income-graphic`-class tag colour with the period total in the
  hole and the legend rows (label, amount, share) underneath. Hand-rolled
  stroke-dasharray arcs; no charting dependency.
- **Cash-flow chart:** weekly income/expense bars with a net line, inline SVG.
- **Account card:** icon tile, name, type and currency, status chips and a tinted
  balance block with the booked-movement count.
- **Rule tile:** name, an on/off switch, the matched expression in monospace and
  the tags it applies.
- **Option card:** one export or import method with its explanation, controls and
  a dashed dropzone.
- **Status chip:** pill-shaped with tone variants (`income`, `expense`, `vault`,
  `info`, `neutral`); `meta` and `mono` variants cover uppercase and hashed data.
- **Tag pill:** pill tinted with the tag's own colour — a 12 % background tint of
  it and a text colour mixed toward `--text` so contrast holds.
- **Colour picker:** eight palette swatches from the design tokens, each a 30 px
  rounded tile in a white tray, rendered as a radiogroup; the selection carries a
  white check and an accent ring that stays visible on any colour. The last tile
  is the free colour: a checkerboard with an eyedropper until it carries a colour
  of its own, and the browser's colour picker behind it, so any `#rrggbb` value
  stays reachable without a hex text field. A live preview pill shows the tag's
  name in the chosen colour. Shared by the create form and the inline tag editor,
  which give the control its own row.
- **File field:** a bordered row with the field name, a secondary "Choose file"
  button and the selected file name. The native `<input type="file">` is hidden
  but still the control that opens the picker, so the keyboard and screen readers
  keep working; the browser's own 1990s chrome is never shown.
- **Switch:** 40×22 px on/off control for pausing a tagging rule.
- **Tag picker:** a compact trigger that summarises the selection (up to two tag
  pills plus a `+N` counter) and opens a popup with a search field, a scrollable
  checklist and `Clear` / `Done` actions. Used wherever tags are chosen, so a
  vault with hundreds of tags never inflates a table row or a form.
- **Buttons:** primary teal (36 px, radius 10), secondary white with a hairline,
  soft-red for destructive actions and session locking, soft-emerald for
  "updated" confirmations.
- **Inputs:** 36 px, `#f8fafc` with a hairline on white cards and white on tinted
  panels, teal focus ring with a soft halo.
- **Banner:** inline feedback for errors, confirmations, warnings and loading.

## Mapping to implemented features

Only shipping functionality is on screen; every figure comes from the API.

| Section | Contents |
| --- | --- |
| Dashboard | Hero with the period lead, status chips and the segmented period control (month / 3 months / year / custom), Export data and New transaction shortcuts; four metric cards per currency (total balance, income, expenses, net + savings rate) with deltas against the previous equal-length period; cash-flow chart (weekly income/expense bars with a net line, inline SVG); the spending breakdown as a **pie chart per currency** with legend rows, percentages, average daily spend and the top category; recent transactions table; accounts summary; the bank sync card (last sync, **Sync now**, reconnect warnings) and the local vault status card |
| Accounts | Hero with the account and currency counts and a ribbon of booked balances per currency, create form, and one card per account with its real balance per currency and booked-movement count, archive, restore an archived account, and cascade delete |
| Transactions | Hero naming the ledger, record form (notes, tag picker, status), server-side filters (text, account, tag, status, date range), quick tag-filter pills tinted with each tag's colour, and a table with inline editing of **payee, amount, note and tags**, a status chip that switches booked ↔ pending, the source shown as an offline-AES chip, a **Raw** toggle per row that opens the provider record behind it (the stored fields and the bank's own fields side by side, flattened one per row, with the exact JSON one click away), and delete |
| Tags | Hero with the tag count, create with a palette colour or a free colour from the browser picker, **inline rename and recolour** of an existing tag, and cascade delete |
| Rules | Violet engine banner with the rule counts and the backfill action, condition builder (AND/OR, per-field operators, amount currency), tag selection, and a side column of rule tiles with an on/off switch, the matched expression and delete |
| Settings | Hero with the cipher and zero-cloud chips, then Enable Banking first, split into three cards: the application (facts plus a callback-URL block that compares itself with the address in use, with the rest of the settings and the disconnect action behind disclosures), the guided bank picker (country and account type with **Load available banks** under them, the search, the sandbox credentials), and the linked banks with their status, per-account mapping, the balance the bank reports with the type it came from, Sync now and Unlink. The picker and the pending-authorization panel take turns: while a consent waits, the card shows only the panel — approve in the bank window, or **Delete** the request — and the picker returns the moment the connection lands. A **Next** banner on the first card always names the action left to take. The passphrase change and the paired export and import option cards (transaction CSV, every table as a plain ZIP, complete encrypted archive, CSV preview and merge, archive replacement) follow |

The mockup's global search field is **deliberately left out of the top bar**:
free-text search lives in the Transactions filters, next to the other query
controls, so there is one place to search the ledger instead of two. If a global
search comes back later, it should reuse the same server-side query endpoint.

The top bar's clock shows the local wall time, refreshed every 30 seconds. There
is no session countdown: the API exposes no remaining-time value, and inventing
one would be a figure the vault cannot compute.

Deliberately absent because the product does not have them: the user avatar and
account identity (Flowly has no accounts or users), the interface theme switch
(the design ships one light theme), transfer/top-up actions, filtered exports,
the ledger checksum chip and the mockups' illustrative node identifiers.

The vault lock screen uses the same language: centered card, lock badge,
passphrase field, the no-recovery warning, and a tinted facts row with the vault
state.
