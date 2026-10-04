# ADR 0043 — The expense detail page reads one currency at a time

Status: Accepted (2026-10-04)

## Context

The dashboard answers "where did the money go in this period", and it answers it
three ways: balances, cash flow and spending by tag. A reader who wants to
interrogate one of those figures — how many movements, on which days, from which
account, at what size, and how fast the period is burning — has to open the
ledger and add the numbers up by hand. The mockups ask for a second page after
the dashboard that does exactly that.

That page cannot be built the way the mockup draws it. Budgets were removed
from the product ([ADR 0010](./0010-remove-budgets.md)) and so were recurring
rules ([ADR 0015](./0015-remove-recurring-rules.md)), while the mockup's
threshold line and its fixed/variable and 50/30/20 splits are all statements
about budgets, recurrence or a taxonomy the vault does not store. Presenting
any of them as a fact would invent meaning the data does not carry. The page
also cannot blend currencies, which a single figure named "total spending"
would quietly do the moment a vault holds a second one.

## Decision

- **A new sidebar section, Details, sits directly after Dashboard.** It is a
  section like the others: it opens with the shared `SectionIntro` and period
  picker and holds its own cards. Nothing moves off the dashboard.
- **`GET /api/analytics/expenses` answers it, under a new `ExpenseDetails`
  contract.** It takes the same `months=YYYY-MM,…` scope as the dashboard and
  the same scattered-set semantics: a day whose month the caller left out
  carries `selected: false` and never a figure, so the heatmap can tell "not
  counted" from "no spending".
- **One currency carries every figure.** The page picks the currency the period
  spends most in and names the others in `otherCurrencies`; it never converts.
  The rule is the dashboard's ([ADR 0008](./0008-dashboard-search-and-budget-semantics.md)):
  booked movements only, own transfers excluded
  ([ADR 0039](./0039-transfers-stay-out-of-the-flow-figures.md)), integer minor
  units and ISO dates throughout.
- **The panels only read what is stored.** Totals (spent, income, net, average
  per day, average per active day, average per movement, largest movement); the
  breakdown by tag; the breakdown by account; the breakdown by source
  (bank sync, file import, entered by hand); the distribution across amount
  bands; one entry per day and one per seven-day slice; and the cumulative
  trajectory with a projection at the pace the elapsed days set. The weekly
  bars use the period's own average as a reference line, because an average is
  something the vault can prove and a budget is not.
- **The projection is an arithmetic statement, not a promise.** It appears only
  when the period covers today and only from the days already elapsed, and the
  caption says "at the pace so far".
- **Charts stay hand-rolled.** The donut, the weekly bars, the cumulative line
  and the heatmap are SVG with HTML hit targets, keyboard-reachable, and each
  carries one readable summary for assistive technology, like the dashboard's.
  The page adds no charting dependency.

## Consequences

- `contracts/schemas/expense-details.schema.json`, its fixture, the generated
  `ExpenseDetails` type and the AJV validator ship together; the route validates
  the payload before it leaves the API, so a future native client cannot drift.
- `docs/SCREENSHOTS.md`, `tooling/scripts/screenshots.mjs` and the README now
  carry seven sections; `docs/DESIGN.md` records the page's grid and the new
  chart classes.
- A budget threshold or a fixed/variable split can still be added later, but as
  a real stored decision with its own ADR and contract — not as a heuristic
  dressed up as a figure.
