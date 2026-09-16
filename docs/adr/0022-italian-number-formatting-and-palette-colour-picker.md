# ADR 0022 — Show money in Italian format, and pick tag colours from a palette

Status: Accepted (2026-09-16)

Corrects the presentation rules of
[ADR 0021](./0021-slate-and-teal-ui-with-dashboard-pie-chart.md) and the
"no native colour wheel" line of
[ADR 0012](./0012-align-web-ui-with-sovereign-ledger-mockups.md).

> **Update (2026-09-16, later the same day).** The top-bar **Export data**
> shortcut was removed: exporting has one home, Settings. The deep link survives
> on the dashboard hero's **Export data** button, which is now the only shortcut
> that lands on the export block.

## Context

Reading the running app surfaced four presentation problems:

1. Every amount was rendered in the English convention (`1,234.56`), which is
   not how the people running Flowly read their bank statements.
2. In a table, an `AMOUNT` column header and its figures did not line up: only
   the header carried the right alignment, so the monospaced figure floated at
   the left of its cell.
3. **Export data** in the top bar opened Settings at the top, so the person had
   to find the export block themselves.
4. The tag picker was a row of circles plus an `#rrggbb` text field, which read
   as a developer control rather than a choice.

## Decision

- **Present money the Italian way; store and export it canonically.** The client
  formats amounts as `1.234,56` (dot for thousands, comma for decimals) and rates
  as `12,5 %`-style percentages. Stored values stay signed integer minor units,
  the API keeps ISO dates and canonical decimals, and a CSV or archive export is
  unchanged: ADR 0008's "no locale formatting" rule still governs computation and
  the interchange formats, this record only governs the presentation boundary
  that PLAN's internationalization section reserves for the client.
- **Parsing accepts both conventions.** The amount fields read `1.234,56` and
  `1,234.56`, a lone three-digit group (`1.234`) as thousands unless the currency
  has three decimals, and refuse anything the currency cannot express. Anyone
  pasting a number from a foreign statement is not punished for it.
- **Amount columns are right-aligned as a column**, header included, so figures
  line up on their last digit.
- **Export data is a deep link.** The top bar shortcut and the dashboard hero
  button open Settings *at* the export block: the shell scrolls the block into
  view and moves focus to it, so the keyboard lands where the click pointed.
- **The tag colour picker is a palette first.** Eight token swatches as tiles,
  plus one free-colour tile that opens the browser's own colour picker. The
  `#rrggbb` text field is gone. Any colour stays reachable (the browser dialog
  accepts a hex value and, where the platform allows, samples a pixel), which is
  what the removed field existed for.

## Consequences

- `docs/DESIGN.md` records the number format, the aligned amount column, the
  deep link and the new picker; the tag mapping row no longer promises a hex
  field.
- The web tests assert Italian figures (`-12,30 EUR`, `1.234,56 EUR`), and
  `src/lib/money.test.ts` covers formatting and parsing, including the English
  paste and the three-decimal currency case.
- The colour picker now depends on `<input type="color">`, which every browser in
  the supported matrix renders; its look differs per platform, so it is used for
  the free colour only and never for the token swatches.
