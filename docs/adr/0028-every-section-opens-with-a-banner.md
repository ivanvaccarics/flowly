# ADR 0028 — Every section opens with the same banner and headline

Status: Accepted (2026-09-22)

## Context

The redrawn Rules page introduced a shape the older pages did not have: a
tinted strip above the section, naming what the section is and what it has to
state, then a headline worth reading with the section's own action beside the
vault's summary facts. The other five sections still opened with the `PageHeader`
hero card of the Sovereign Ledger generation — a white card whose lead and chips
were doing the same job with a different voice — so the product read as two
designs depending on the page.

## Decision

- **Two shared components carry the page heading.** `SectionBanner` renders the
  icon tile, the eyebrow, the title with a state chip, a sentence about the
  section, right-aligned state chips and — when the section has numbers — a row
  of figures under the text. `SectionIntro` renders the eyebrow with the
  section's icon, the headline, a lead and the one action the section is for.
  Every in-shell section uses both, in that order, above its content.
- **The tone carries meaning, not decoration.** Green banners for the money
  itself (dashboard, accounts, ledger), violet for the automation around it
  (rules, tags), slate for the vault (settings).
- **The figures in the banner are real and already computed.** The ledger's
  banner reads this month's income, expenses and net from the same
  `GET /api/dashboard` the dashboard page uses; the accounts banner shows the
  booked balance per currency; the rules banner shows the transactions the
  engine evaluated and how many rules are active. A section with nothing to
  count simply omits the figures row.
- **The top bar gains the mockups' breadcrumb.** A small uppercase eyebrow above
  the `h1` names the family the section belongs to; the vault-state pill, the
  vault id, the clock and the session controls are unchanged.
- **The ledger's record form moves into a dialog.** Its own mockup puts the
  ledger at the centre and adding a movement in the section's action, so the
  form opens over the page from **Add transaction**, exactly like the rule
  composer's edit dialog, and the filters, the **View** pills, the table and the
  pager live in one card instead of two.
- **The standalone bank callback keeps `PageHeader`.** It renders outside the
  shell and owns the page's `h1`; the hero card, its facts and its actions are
  still the right shape there. The `ribbon`/`info` variants and the `Stat`
  helper lost their last callers and were removed.

## Consequences

- `docs/DESIGN.md` documents the banner, the intro and the breadcrumb as the
  page pattern, and the mapping table per section; `docs/TESTING.md` gained the
  checks for the banner, the breadcrumb and the ledger dialog; `README.md`
  describes the sections as opening the same way.
- Card headers across the pages now carry an uppercase eyebrow above the
  heading, so a card says what it is without reading its lead.
- A future section adds a page by choosing a tone, an icon, a title, a sentence
  and its figures — not by writing another hero.
