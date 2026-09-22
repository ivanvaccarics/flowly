# ADR 0033 — The dashboard is scoped by months and by tags

Status: Accepted (2026-09-22)

## Context

The dashboard opened on a range (this month, three months, a year) and drew its
spending as a pie per currency, where a slice was a link to the ledger and
nothing more. The redrawn dashboard asks a different question: which months am I
looking at, and what happens to the picture if I ignore a category? A range
cannot express that — selecting November, December, January, February and
September would drag March to August in with it — and a pie has no room to say
"this category is currently switched off".

## Decision

- **The period is a set of months, not a range.** The dashboard asks the server
  for `months=YYYY-MM,…`, and the server accepts it as its own scope: the totals,
  the chart and the category bars consider transactions whose booking month is in
  the set, never the months between. `from`/`to` stay supported for callers that
  only have a range (the Accounts page), and a `months` value that is not a
  month answers 400 rather than being ignored.
- **The chart buckets by month** when a month set is given: one bucket per
  selected month and currency, empty months included, so the axis stays
  continuous without inventing a figure for a month nobody selected.
- **Categories are the tag filter, and they stay visible.** The spending
  breakdown is a list of bars per currency; each row toggles its tag in or out
  of the figures. The list itself always describes the whole period — an
  excluded tag is dimmed, never removed — so a category that disappears from the
  totals can always be switched back on. Tags are excluded rather than included:
  a tag created after the fact is part of the picture by default.
- **The tag filter narrows the flows, not the snapshot.** Balances stay the
  account balances (a "balance of one tag" is not money); income, expenses, net
  flow, the chart, the recent movements and the ledger link follow the selection.
  The ledger's own search accepts the same `months` and `tags` values, so "see
  these rows" means the same rows the figures were computed from.
- **The pie is retired.** Its job — spending by tag, per currency — is the
  category bars, which also carry the filter and the per-row link to the ledger.
  Nothing else about the charts changes.

## Consequences

- `GET /api/dashboard` gains `months` and `tags`; the response shape is
  unchanged, and `dashboard.schema.json` keeps describing it. The server caches
  per scope+months+tags key, so switching a category off does not serve the
  previous answer.
- `docs/DESIGN.md`, `docs/TESTING.md`, `docs/PLAN.md` and `README.md` describe
  the period picker, the category filter and the monthly chart; ADR 0021 keeps
  its pie decision as history and points here.
- A future native client gets the same scoping from the same endpoint instead of
  re-implementing "which months did the reader pick".
