# ADR 0034 — The spending breakdown stays a donut, and its legend is the tag filter

Status: Accepted (2026-09-22). Supersedes the shape decided in
[ADR 0033](./0033-the-dashboard-is-scoped-by-months-and-tags.md).

## Context

ADR 0033 replaced the spending donut with a list of category bars so that the
tags could be switched on and off. The filter is right; the shape is not. The
donut reads a period at a glance — where the money went, in proportion — and
that is what the dashboard is for. The bars asked the reader to compare lengths
to get the same picture, and the row-as-a-button made "click to filter" less
obvious than a control that says what it does.

## Decision

- **The breakdown is a donut again**, one per currency, an arc per *included*
  tag, with the drawn total in the hole and the hovered or focused tag's share
  read out in it, as before. Excluding a tag redraws the ring for the tags left
  on, so the picture answers the question the filter asked.
- **The legend is the filter, and it uses checkboxes.** Every tag of the period
  stays in the legend with a checkbox, its amount and its share of what is drawn;
  a tag that is switched off keeps its row (dimmed, share replaced by a dash) so
  it can always be switched back on. Real checkboxes are what "tick a category"
  should look like, and they are reachable and readable without a mouse.
- **The row keeps its own way into the ledger.** The small record button at the
  end of each legend row opens the ledger filtered to that tag and the selected
  period, so filtering a figure and inspecting the rows behind it stay separate
  actions — and clicking a slice still opens the ledger too.
- **The period picker's actions move onto the chips row.** **All &lt;year&gt;**,
  **Clear** and the count now sit at the end of the row that holds the selected
  months, instead of floating at the end of the month grid above them.

## Consequences

- ADR 0033 keeps its decision — the months-and-tags scoping, the excluded-tag
  model and the endpoint — and points here for the breakdown's shape.
- `docs/DESIGN.md`, `docs/PLAN.md`, `docs/TESTING.md` and `README.md` describe
  the donut, the checkbox legend and the aligned actions; the README screenshots
  are regenerated.
