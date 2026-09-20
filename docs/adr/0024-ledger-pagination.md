# ADR 0024 — The ledger pages through its rows on the server

Status: Accepted (2026-09-20)

## Context

Transaction search has accepted `limit` and `offset` and answered with `total`
since Phase 4, and [ADR 0008](./0008-dashboard-search-and-budget-semantics.md)
fixed the ordering as booking date then id *so pagination stays stable*. The
transactions view never used any of it: it called `api.searchTransactions` with
the filters alone, so the server applied its own default of 100 rows and the
table rendered whatever came back.

A vault with more than a hundred matching movements therefore ended mid-list —
and the header chip, which counts *every* match, said so: `412 matching` sat
above a table of 100 rows with no way to reach the rest. Nothing was missing
from the response; the client simply ignored the window the API offered.

The dashboard's recent-transactions card is a different case: five rows are the
point of that card, and it already asks for `limit: 5`.

## Decision

- **The ledger pages on the server, not in the browser.** The loader sends
  `limit` and `offset` and reads `total`; a vault never ships its whole ledger to
  the client to slice it there. The server keeps its own `MAX_SEARCH_LIMIT` of
  500, so this is a client decision with no API change.
- **Twenty-five rows per page by default**, with a **Rows per page** selector
  offering 25, 50 and 100. A ledger is read a screenful at a time: 25 keeps the
  table scannable and the page quick on a Raspberry Pi, and the selector covers
  "show me more" without turning the browser into a spreadsheet.
- **The window is stated, not implied.** The footer reads
  `Showing 26–50 of 60 transactions` and `Page 2 / 3`, both computed from
  `total` and the request's own `offset` — never from the local array, which
  only ever holds one page.
- **Previous and Next, not a numbered strip.** The ledger is browsed
  newest-first inside a filter; jumping to page 17 of a result set is not a task
  here, and a numbered strip would have to survive deletions and filter changes
  to stay honest.
- **A filter change starts at page 1.** Every change to the search box, the
  account, tag, status or date controls — and the Reset button — defines a new
  result set, where the old page number may not exist.
- **Recording a transaction returns to page 1**, because a manual entry is
  normally dated today and therefore sorts to the top; the alternative is saving
  a row the user cannot see. Edits, status toggles and deletions reload the page
  you are on, so your place survives a write.
- **A page that empties folds back.** When the last row of the current page is
  deleted, or a write moves a row out of the active filter, the server answers
  with an empty page and a smaller total. The view then reloads the last page
  that still has rows instead of showing an empty table next to a non-zero
  count.
- **The pager lives in the results card**, under the table and above the empty
  state: the range on the left, the controls on the right, a hairline between
  them and the last row.

## Consequences

- `docs/DESIGN.md` lists the pager among the components, `docs/TESTING.md` gains
  a manual check for it, and `README.md`, `docs/RUNNING.md` and `docs/PLAN.md`
  describe the ledger as paged.
- Paging is stable across reads because the ordering is deterministic (booking
  date, then id): a row never moves between pages between two loads, so no
  cursor or snapshot is needed.
- The client now depends on `total` meaning "rows that match", not "rows
  returned" — which is how the API has always answered, and what the header's
  `{total} matching` chip already assumed.
- Page size is a client choice; the Dart client can pick a different one from
  the same parameters without touching the contracts.
- Filtering still happens in the server's in-memory pass before paging
  (ADR 0008). If a vault ever grows past what that pass can answer
  interactively, the fix belongs in the query layer, not in this view.
