# Flowly UI design system

The interface follows **Sovereign Ledger**, the design language captured in the
repository's `ui/` folder (desktop mockups of the dashboard, ledger, accounts,
rules, vault and settings screens). That folder is a local, untracked reference
— the tokens and rules that matter are reproduced here and implemented in
`apps/web`, so the codebase is self-contained and this document is the
authoritative summary for anyone cloning the repository.

## Character

High-trust, sovereign and quiet: white cards with a hairline outline and a soft
shadow over a warm off-white canvas, one green used sparingly, and a serif that
appears only where the product speaks in a full sentence. No decorative noise,
no dark-mode inversion, no gradient across the chrome. Colour only enters where
it carries meaning: the brand green for the product's own actions, the one
filled card that states the balance, green for inflows, a muted red for
outflows and destructive actions, violet for engine-level information.

## Brand

The Flowly mark is a white keyhole knocked out of a green squircle, locked up
with the rounded `Flowly` wordmark. Everything is SVG, served from
`apps/web/public`:

| Colour | Value | Where it lands |
| --- | --- | --- |
| Deep green | `#0b3d2e` | The dark end of every gradient: the tile's top-left, the stem of the `F`, the browser theme colour |
| Brand green | `#1e6f4e` | The middle stop of the gradient, primary actions, the filled balance card, the default tag colour |
| Gold | `#d4af37` | The bright end: the tile's bottom-right, the tail of the `y`, gold tags — never text |

The gradient runs deep green → brand green → gold: left to right in the
wordmark, top-left to bottom-right in the tile. The chrome wears that same
lockup — `logo.svg`, the gradient tile with the wordmark — so the product looks
like Flowly wherever it appears.

| Asset | Use |
| --- | --- |
| `logo.svg` | Horizontal lockup — tile plus wordmark; the sidebar, the unlock card and the README |
| `logo-mark.svg` | The tile alone on a transparent square, for light or dark surfaces |
| `logo-mark-mono.svg` | The keyhole alone in white, for dark or tinted surfaces; the session card's avatar |
| `favicon.svg` | The tile with a little air around it; browser tab |

The tile is painted through a mask (the tile's two traced halves minus the
keyhole) so its knockout edge stays crisp instead of picking up the seam where
the halves meet. The wordmark ships as outlines, not as live text: it keeps its
rounded shape with no webfont, which is what a private network without a CDN
needs. The lockup carries no tagline; the unlock card states it as the lead
paragraph, where a screen reader reads it once, and every asset is labelled
simply "Flowly". The chrome places the lockup at 30 px tall — the tile lands at
the 30 px the sidebar keeps for it — and the unlock card at 34 px.

## Tokens

Defined once as CSS custom properties in `apps/web/src/styles.css`: the brand
palette above plus the mockups' slate neutral ramp with emerald, red, amber,
blue and violet accents.

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#f7f8f5` | Application background behind the cards, and the top bar |
| `--surface` | `#fffefb` | Cards, tables, popovers, inputs |
| `--sidebar` | `#f7f8f5` | The navigation rail, separated by a hairline |
| `--surface-low` | `#f2f7f3` | Fieldsets, ribbons, list rows, option cards, icon tiles |
| `--surface-sunken` / `--surface-high` | `#eef2ee` / `#e4eae4` | Control tracks, hover states, table hairlines |
| `--border` / `--border-strong` | `#e1e8e3` / `#cfdad3` | Card outlines, row dividers, dashed dropzones |
| `--text` / `--text-secondary` / `--text-muted` / `--text-faint` | `#203032` / `#46585a` / `#667571` / `#74827e` | Headlines and figures, body, metadata, the date eyebrow |
| `--brand-deep` / `--brand` / `--brand-gold` | `#0b3d2e` / `#1e6f4e` / `#d4af37` | The brand palette: the lockup gradient, the default tag colour, anything that has to read as Flowly |
| `--brand-gradient` | `#0b3d2e → #1e6f4e (55 %) → #d4af37` at 120° | The lockup and the import progress bar — never behind text |
| `--brand-shadow` / `--brand-ring` | `rgba(11, 61, 46, 0.26)` / `rgba(30, 111, 78, 0.18)` | The lift under primary buttons / focus halos |
| `--primary` / `--primary-hover` | `#1e6f4e` / `#17593f` | Primary actions, the filled balance card, the active navigation pill, the on-state of a switch |
| `--primary-soft` / `--primary-ink` | `#e3f1e8` / `#17593f` | The active navigation pill, chips, icon tiles, tag pills |
| `--accent` | `#0b3d2e` | Active navigation icon and the dot that ends the active item |
| `--income` / `--income-graphic` / `--income-soft` | `#1f7a58` / `#37997a` / `#e4f2eb` | Inflow text / chart bars and dots / chips and tiles |
| `--expense` / `--expense-graphic` / `--expense-soft` | `#a8515d` / `#cf7280` / `#f8e9eb` | Outflow text / chart bars / chips and destructive buttons |
| `--info` / `--info-graphic` / `--info-soft` | `#6a5fa0` / `#8d81c9` / `#eeebf7` | Engine-level chips, the rule composer's accent |
| `--warning` / `--warning-soft` | `#8a5f28` / `#f7efe2` | Sovereign-warning notices |
| `--accent-blue` / `--accent-blue-soft` | `#35618f` / `#e8eff6` | Secondary chart slices |
| Radius | 8 px / 12 px / 18 px / pill | Micro controls / inputs and buttons / cards and panels / chips |
| Shadow | level 1–3 | Cards, hover and popovers, modal and unlock card |

Every colour that carries text clears WCAG AA on white: the gold is a fill, a
chip tint or a chart slice and never a label, and a tag that is coloured gold
gets its text mixed toward `--text` (`tagPillStyle`) so the pill stays legible.
Where a mockup value would have missed AA the token is one step darker
(`--income`, `--expense`, `--primary`, `--info`); chart fills, dots and icons
keep the mockup values exactly.

## Typography

- **Headline (local serif):** the one full sentence a page opens with — every
  section's headline, and the unlock card's welcome — set at 2-2.5 rem.
- **Display (Manrope):** card titles, metric values, ribbon figures and chart
  centres.
- **Body (Inter):** controls, prose, table cells, the sidebar and the top bar.
- **Data (JetBrains Mono):** key fingerprints, hashes, provider payloads, dates
  in the ledger and the amounts and shares beside a chart legend. Money is set
  in the display
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
the families are declared with local fallbacks (`Iowan Old Style`, `Palatino`,
`SF Pro`, `Segoe UI`, system fonts). Where they are installed the intended look
is reproduced exactly; otherwise the closest system face is used and the layout
does not shift. The wordmark is outlines, never a font, so the brand looks the
same on every machine.

## Layout

- Fixed 218 px sidebar in the canvas colour, separated from the content by a
  hairline: the Flowly lockup, the **Your vault** label and the six sections, then
  the session card at the foot — the vault's own name, its state in words, and
  the two session controls as icon buttons (**Lock session**, **Lock all**).
  The active section is a soft-green pill with a brand-green icon and a dot at
  its end.
- Sticky 70 px top bar in the canvas colour over a hairline, carrying what the
  session knows — an **Encrypted locally** chip and the hour the vault was
  opened — and the one action that belongs to the vault rather than a section:
  **Backup vault**, which deep-links into Settings' export block and focuses it.
  The page's `h1` is read, not printed: the active sidebar item and the page's
  own headline name the section on screen.
- Content column capped at 1560 px with 40 px gutters; cards carry 24 px internal
  padding and a 20 px gap inside a grid. The dashboard's own grid is three
  columns: the chart and the recent movements take two, the bank card and the
  spending donut take one, and the accounts summary spans the row.
- Below 1200 px the dashboard grid folds to two columns, below 1024 px the
  sidebar becomes a horizontal, wrapping nav, the top bar wraps and everything
  stacks.

## Components

- **Page title:** the single `h1` of every screen is read by assistive
  technology and pointed at by each view's `aria-labelledby`, but it is not
  printed: the sidebar names the current section, and every page opens with its
  own headline.
- **Dashboard header:** the eyebrow with the section's icon, the page's own
  sentence in the serif, one line about what the figures mean, and the two
  actions the page is for — **Export data** and **New transaction**. The period
  controls sit under it, open, in the same card the other sections use for
  their filters.
- **Page header:** every section opens the same way and nothing else comes
  first — an eyebrow with the section's icon, the section's own sentence in the
  serif, a lead that says what the page does, and, when the section has one, the
  one action or piece of state that belongs beside the name (the currency chip
  on accounts, the active-rule chip on rules, **Add transaction** on the ledger,
  **Export data** and **New transaction** on the dashboard). There is no banner
  above it: a page states itself once, and the figures live in the cards where
  they can be used.
- **Page header:** the older hero card, kept only for the bank callback, which
  renders outside the shell and owns the page's `h1`.
- **Coverage bar:** the overview's stacked bar, one segment per tag the rules
  apply, each in the tag's own colour and sized by how many transactions that tag
  covers, with a legend of `#Tag (n)` rows underneath. The numbers come from the
  same read as the match counts, so the bar can never disagree with the registry.
- **Condition row:** one line of the composer — a numbered badge, the field, the
  operator, the value (with the currency for an amount), and the remove control,
  wrapping on narrow screens. The badge keeps the row's order readable when the
  conditions are several.
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
  under the row. A click on a cell the dialog can change — date, payee, note,
  tags, amount — opens the movement in a dialog, next to the row's **Edit**
  button, which does exactly the same and stays as the keyboard-friendly way in.
  A cell that carries an action of its own, like the status chip, keeps it. The
  row's second line names where it came from (the bank's own description, or the
  source); a provider's raw row id lives only behind **Raw**.
- **Dialog:** the composer, the rule editor and the movement editor open over the
  page in one dialog — a full-viewport backdrop *above* the sticky top bar, with
  the body scrolling under it. Escape, the X and **Cancel** close it without
  writing, focus is trapped while it is open and returns to the control that
  opened it, and the dialog never repeats the page's `h1`.
- **Pager:** the footer of the ledger — `Showing 26–50 of 60 transactions` on
  the left, then **Rows per page** (25, 50, 100), **Previous**, the `Page 2 / 3`
  chip and **Next** on the right, over a hairline that separates it from the last
  row. The window comes from the server (`limit`/`offset`/`total`), so the range
  and the page count are always the real ones; the buttons disable at the ends
  instead of hiding (ADR 0024).
- **Donut and legend:** the dashboard's spending breakdown, one donut per
  currency, an arc per tag of the period in the tag's own colour with the total
  in the hole (the hovered or focused tag's amount and share replace it). Every
  tag of the period is always included — the dashboard's only scope is the
  period — so the legend is a read-out, not a filter: colour, name, amount and
  share per row. A row is a button that opens the ledger on that tag.
- **Period picker:** the dashboard's own bar, always visible under the header —
  the preset segments (month, 3 months, year, custom), a year strip with a count
  of that year's selected months, the twelve months of the year the strip points
  at, and the selected months as removable chips with **All &lt;year&gt;**,
  **Clear** and the count on the same row. Clicking a month is what "custom"
  means, and the preset follows the click. Changing the period dims the figures
  that are being re-read instead of inserting a banner: nothing moves under the
  pointer while a read is in flight.
- **Metric card:** the three figures a period is read by — the balance across
  accounts, what was spent and what came in — each a card with a label, an icon
  tile, a large tabular value with its currency and a one-line context. The
  balance card is the page's one filled surface: brand green with white type,
  the period's net flow underneath and the savings rate as a badge. One row per
  currency, because unlike currencies are never added together.
- **Recent transactions:** the dashboard's movement list — an icon tile, the
  payee, a meta line naming the day, the account and where the row came from
  (never the provider's raw id), the row's tags as pills, and the amount on the
  right, green for inflows and red for outflows. It pages ten rows at a time and
  links to the full ledger.
- **Backup strip:** a dashed, soft-green strip under the dashboard stating that
  the vault is stored on the device and ready for an encrypted backup, with the
  **Export data** deep link into Settings.
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
- **Tag directory:** the tags page as a workbench of two cards — **New tag** on
  the left (the name field wears its `#`, the colour picker sits under its
  label, and the preview pill follows the name as it is typed) and **Tag
  directory** on the right. The directory carries a search field, a sort
  (most used, name, newest), **All / Used / Unused** tabs, a **Jump to** strip
  of the first letters the vault actually uses, and a table of tag (`#` tile in
  the tag's own colour), what applies it (how many rules) and its usage (a pill
  with the number of movements carrying it). A row opens the tag in a dialog —
  name and colour, **Save tag** — and the two icon buttons beside it do the same
  and ask before deleting. The footer counts `1–6 of 6` and pages eight at a
  time; under the table sit three notes: a taxonomy tip, how many tags no
  movement uses, and how matching is case-insensitive.
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
| Dashboard | The serif headline with **Export data** and **New transaction**, then the **period picker** in its own card — the preset segments, the year strip, the month grid, and the selected months as removable chips with **All &lt;year&gt;**, **Clear** and the count on the same row; a **metric row per currency** — the filled balance card with the period's net flow and the savings rate, then what was spent and what came in, each with its delta against the previous equal-length period; an **interactive** cash-flow chart (income/expense bars with a net line, inline SVG) whose hovered month is lit, guided and read out in a tooltip, one keyboard stop walked with the arrow keys, and clickable to open that month in the ledger; the spending breakdown as **one donut per currency**, every tag of the period always drawn, with a legend row per category (colour, amount, share) that opens the ledger filtered to that tag; the recent movements as a paged list (ten rows at a time on the server, with the window and its own Previous/Next); the bank sync card (last sync, **Sync now**, reconnect warnings); the accounts summary; and the backup strip with the **Create backup** deep link |
| Accounts | The headline with the currency chip, the create form, and one card per account with its real balance per currency and booked-movement count, archive, restore an archived account, and cascade delete |
| Transactions | The headline naming the encrypted ledger with **Add transaction** (the record form opens in a dialog over the page, with the tag picker and the tagging-rules note), and one ledger card holding the server-side filters (text, account, tag, status, date range), the **View** pills (all movements, then one pill per tag in its own colour), the table — a row opens the movement in the same dialog with one **click** on a cell or on the row's **Edit** button, with account, booking date, amount, payee, note, status and tags — a status chip that switches booked ↔ pending, the source as an offline-AES chip, a **Raw** toggle per row that opens the provider record behind it (the stored fields and the bank's own fields side by side, flattened one per row, with the exact JSON one click away) and delete — and the pager footer |
| Tags | The serif headline with **New tag** beside it, then the workbench: **New tag** (name with its `#`, the palette or a free colour from the browser picker, a live preview) on the left and the **Tag directory** on the right — search, sort (most used, name, newest), All / Used / Unused, the **Jump to** letters, and one row per tag with what applies it and how many movements carry it, opening the editor dialog on a click with **Edit** and the confirmed cascade **delete** beside it, paged eight at a time — over three notes: a taxonomy tip, the unused tags, and the case-insensitive matching |
| Rules | The headline naming the engine with the active-rule chip, then the **composer** holds the condition builder (rule name and AND/OR logic side by side, numbered condition rows with per-field operators and the amount currency, a dashed **Add condition**, and the tags as toggle pills) over a footer with **Reset**, **Simulate on 100 tx** and **Save rule**; a **live evaluation** line under the form reports what the draft currently matches, read from the server without saving anything. The **overview** column carries automation metrics — total matches, the share of the ledger covered, a stacked bar and legend per tag the rules apply, the rule count and the engine's on/off state — and the **registry** is a full-width table of every rule (name and state, the matched expression, its tags, its match count, an on/off switch, edit and delete) with All/Active filters, an enable/disable-all action and the backfill button. **Edit** opens the same composer fields in a dialog over the page and saving replaces that rule's conditions while keeping its id, state and order; the composer behind keeps its own draft, untouched by the edit, and a click anywhere on a registry row opens the same dialog |
| Settings | The headline, then Enable Banking first, split into three cards: the application (facts plus a callback-URL block that compares itself with the address in use, with the rest of the settings and the disconnect action behind disclosures), the guided bank picker (country and account type with **Load available banks** under them, the search, the sandbox credentials), and the linked banks with their status, per-account mapping, the balance the bank reports with the type it came from, Sync now and Unlink. The picker and the pending-authorization panel take turns: while a consent waits, the card shows only the panel — approve in the bank window, or **Delete** the request — and the picker returns the moment the connection lands. A **Next** banner on the first card always names the action left to take. The passphrase change and the paired export and import option cards (transaction CSV, every table as a plain ZIP, complete encrypted archive, CSV preview and merge, archive replacement) follow |

The mockup's global search field is **deliberately left out of the top bar**:
free-text search lives in the Transactions filters, next to the other query
controls, so there is one place to search the ledger instead of two. If a global
search comes back later, it should reuse the same server-side query endpoint.

The top bar's second chip shows the hour the vault was opened, taken from the
status the server reports rather than from a live clock, so it never drifts from
what the vault knows. There is no session countdown: the API exposes no
remaining-time value, and inventing one would be a figure the vault cannot
compute.

Deliberately absent because the product does not have them: the user avatar and
account identity (Flowly has no accounts or users), the interface theme switch
(the design ships one light theme), transfer/top-up actions, filtered exports,
the ledger checksum chip and the mockups' illustrative node identifiers.

The vault lock screen uses the same language: the flat lockup centred over the
canvas, a white card with the private-vault eyebrow, the hour's greeting, the
serif **Welcome back.** headline, the passphrase field with its reveal button
and the **Unlock vault** action, a hairline, and two trust statements —
`AES-256, encrypted locally` and `No cloud, we never see the key`. The screen
states the vault's state in words ("this vault is locked") and leaves the
storage engine out of it: what encrypts the vault belongs to the technical
documents, not to the door.
