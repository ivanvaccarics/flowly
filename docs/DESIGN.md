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
tabular structures and precise typographic contrast. No decorative noise, no
dark-mode inversion, and the brand gradient is spent where the brand itself
speaks — the tile and the progress bar — never across the chrome. Colour only
enters where it carries meaning: the brand green for the product's own actions,
emerald for inflows, red for outflows and destructive actions, violet for
engine-level information.

## Brand

The Flowly mark is a white keyhole knocked out of a green-to-gold squircle,
locked up with the rounded `Flowly` wordmark. Everything is SVG (plus the one
PNG the iOS icon needs), served from `apps/web/public`, and every asset carries
the same three colours:

| Colour | Value | Where it lands |
| --- | --- | --- |
| Deep green | `#0b3d2e` | The dark end of every gradient: the tile's top-left, the stem of the `F`, the browser theme colour |
| Medium green | `#1e6f4e` | The middle stop: the tile's centre, the `o` and `w`, primary actions, the default tag colour |
| Gold | `#d4af37` | The bright end: the tile's bottom-right, the tail of the `y`, gold tags — never text |

The gradient runs deep green → medium green → gold: left to right in the
wordmark, top-left to bottom-right in the tile. It never sits behind text; the
only other fade the product paints is the soft wash behind the unlock card.

| Asset | Use |
| --- | --- |
| `logo.svg` | Horizontal lockup — tile plus wordmark; the unlock card and the README |
| `logo-mark.svg` | The tile alone on a transparent square, for light or dark surfaces |
| `logo-mark-mono.svg` | The keyhole alone in white, for dark or tinted surfaces; the sidebar brand tile |
| `favicon.svg` | The tile with a little air around it; browser tab |
| `apple-touch-icon.png` | 180 px full-bleed square — gradient, no corner rounding, white keyhole — for iOS home-screen bookmarks |

The tile is painted through a mask (the tile's two traced halves minus the
keyhole) so its knockout edge stays crisp instead of picking up the seam where
the halves meet. The wordmark ships as outlines, not as live text: it keeps its
rounded shape with no webfont, which is what a private network without a CDN
needs. The lockup carries no tagline; the unlock card states it as the lead
paragraph, where a screen reader reads it once, and `logo.svg` is labelled
simply "Flowly". The sidebar draws its own tile in CSS — `.brand-tile`, an
11 px radius on 34 px with `--brand-gradient` — and knocks `logo-mark-mono.svg`
into it at the share of the tile the mark uses (20 px of 34 px).

## Tokens

Defined once as CSS custom properties in `apps/web/src/styles.css`: the brand
palette above plus the mockups' slate neutral ramp with emerald, red, amber,
blue and violet accents.

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#f8fafc` | Application background behind the cards |
| `--surface` | `#ffffff` | Cards, tables, popovers, top bar |
| `--sidebar` | `#f1f5f9` | The navigation rail |
| `--surface-low` | `#f8fafc` | Fieldsets, ribbons, list rows, option cards, inputs |
| `--surface-sunken` | `#f1f5f9` | Chips, icon tiles, control tracks, table hairlines |
| `--border` / `--border-strong` | `#e2e8f0` / `#cbd5e1` | Card outlines, row dividers, dashed dropzones |
| `--text` / `--text-secondary` / `--text-muted` / `--text-faint` | `#0f172a` / `#475569` / `#64748b` / `#94a3b8` | Headlines and figures, body, metadata, placeholders |
| `--brand-deep` / `--brand` / `--brand-gold` | `#0b3d2e` / `#1e6f4e` / `#d4af37` | The brand palette: the tile, the default tag colour, anything that has to read as Flowly |
| `--brand-gradient` | `#0b3d2e → #1e6f4e (55 %) → #d4af37` at 120° | The sidebar tile and the progress bar — the only gradient the chrome gets |
| `--brand-shadow` / `--brand-ring` | `rgba(11, 61, 46, 0.26)` / `rgba(30, 111, 78, 0.18)` | The lift under the tile and primary buttons / focus halos |
| `--primary` / `--primary-hover` | `#1e6f4e` / `#17593f` | Primary actions, active segment, focused fields, the on-state of a switch |
| `--primary-soft` / `--primary-ink` | `#e3f1e8` / `#17593f` | Vault chips, icon tiles, tag pills |
| `--accent` | `#0b3d2e` | Active navigation icon, account dot, outlined focus rings |
| `--income` / `--income-graphic` / `--income-soft` | `#047857` / `#10b981` / `#d1fae5` | Inflow text / chart bars and dots / chips and tiles |
| `--expense` / `--expense-graphic` / `--expense-soft` | `#dc2626` / `#ef4444` / `#fee2e2` | Outflow text / chart bars / chips and destructive buttons |
| `--info` / `--info-graphic` / `--info-soft` | `#7c3aed` / `#8b5cf6` / `#ede9fe` | Engine-level banners and chips |
| `--warning` / `--warning-soft` | `#b45309` / `#fef3c7` | Sovereign-warning banners |
| `--accent-blue` / `--accent-blue-soft` | `#1d4ed8` / `#dbeafe` | The focal figure of a metric row |
| Radius | 6 px / 10 px / 16 px / pill | Micro controls / inputs and buttons / cards and panels / chips |
| Shadow | level 1–3 | Cards, hover and popovers, modal and unlock card |

Every colour that carries text clears WCAG AA on white: the gold is a fill, a
chip tint or a chart slice and never a label, and a tag that is coloured gold
gets its text mixed toward `--text` (`tagPillStyle`) so the pill stays legible.
Where a mockup value would have missed AA the token is one step darker
(`--income`, `--expense`, `--primary`, `--info`); chart fills, dots and icons
keep the mockup values exactly.

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
  hairline outline and a brand-green icon.
- Sticky 64 px white top bar carrying the current section's `h1`, the vault state
  pill (pulsing dot, an `AES-256` badge), the short vault id, the local clock, and
  the session controls (Lock session, Lock all). Exporting has one home —
  Settings — and no top-bar shortcut; the dashboard hero's **Export data** button
  is a deep link that opens Settings, scrolls the export block into view and puts
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
- **Pager:** the footer of the ledger — `Showing 26–50 of 60 transactions` on
  the left, then **Rows per page** (25, 50, 100), **Previous**, the `Page 2 / 3`
  chip and **Next** on the right, over a hairline that separates it from the last
  row. The window comes from the server (`limit`/`offset`/`total`), so the range
  and the page count are always the real ones; the buttons disable at the ends
  instead of hiding (ADR 0024).
- **Pie chart:** the dashboard's spending breakdown, one SVG donut per currency,
  each arc the tag's own colour — brand green first for tags that have none —
  with the period total in the hole and the legend rows (label, amount, share)
  underneath. Hand-rolled stroke-dasharray arcs; no charting dependency.
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
- **Colour picker:** eight palette swatches — Flowly green and gold, then blue,
  violet, emerald, amber, red and slate — each a 30 px rounded tile in a white
  tray, rendered as a radiogroup; the selection carries a white check and an
  accent ring that stays visible on any colour. The last tile is the free
  colour: a checkerboard with an eyedropper until it carries a colour of its
  own, and the browser's colour picker behind it, so any `#rrggbb` value stays
  reachable without a hex text field. A live preview pill shows the tag's name
  in the chosen colour. Shared by the create form and the inline tag editor,
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
- **Buttons:** primary brand green (36 px, radius 10), secondary white with a
  hairline, soft-red for destructive actions and session locking, soft-emerald
  for "updated" confirmations.
- **Inputs:** 36 px, `#f8fafc` with a hairline on white cards and white on tinted
  panels, brand-green focus ring with a soft halo.
- **Banner:** inline feedback for errors, confirmations, warnings and loading.

## Mapping to implemented features

Only shipping functionality is on screen; every figure comes from the API.

| Section | Contents |
| --- | --- |
| Dashboard | Hero with the period lead, status chips and the segmented period control (month / 3 months / year / custom), Export data and New transaction shortcuts; four metric cards per currency (total balance, income, expenses, net + savings rate) with deltas against the previous equal-length period; an **interactive** cash-flow chart (weekly income/expense bars with a net line, inline SVG) whose hovered week is lit, guided and read out in a tooltip, one keyboard stop walked with the arrow keys, and clickable to open that week in the ledger; the spending breakdown as a **pie chart per currency** whose legend rows and slices highlight each other, whose hole reads out the hovered tag (name, amount, share and currency) instead of the period total, and whose rows open the ledger filtered by that tag; legend rows, percentages, average daily spend and the top category; recent transactions table, paged ten rows at a time on the server with the window and its own Previous/Next; accounts summary and the bank sync card (last sync, **Sync now**, reconnect warnings) |
| Accounts | Hero with the account and currency counts and a ribbon of booked balances per currency, create form, and one card per account with its real balance per currency and booked-movement count, archive, restore an archived account, and cascade delete |
| Transactions | Hero naming the ledger, record form (notes, tag picker, status), server-side filters (text, account, tag, status, date range), quick tag-filter pills tinted with each tag's colour, and a table with inline editing of **payee, amount, note and tags**, a status chip that switches booked ↔ pending, the source shown as an offline-AES chip, a **Raw** toggle per row that opens the provider record behind it (the stored fields and the bank's own fields side by side, flattened one per row, with the exact JSON one click away), and delete |
| Tags | Hero with the tag count, create with a palette colour or a free colour from the browser picker, **inline rename and recolour** of an existing tag, and cascade delete |
| Rules | Violet engine banner with the rule counts and the backfill action, a **New rule** card holding the condition builder (AND/OR, per-field operators, amount currency) and the tag selection, and a side column of rule tiles with an on/off switch, the matched expression, edit and delete. **Edit** opens the same fields in a dialog over the page and saving replaces that rule's conditions while keeping its id, state and order; the card behind keeps its own draft, untouched by the edit |
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

The vault lock screen uses the same language: centered card over a wash that
carries a hint of the brand green and gold, the lockup, the passphrase field,
the no-recovery warning, and a tinted facts row with the vault state. It is the
one screen that gets the gradient as atmosphere; everywhere else the colour is
functional.
