# ADR 0029 — A movement is edited in a dialog, not in its row

Status: Accepted (2026-09-22)

## Context

The ledger turned a row into a form: a double-click on the payee, note, tags or
amount swapped those four cells for inputs and the actions column grew Save and
Cancel. It worked, but the row was moving under the pointer, the table's columns
no longer said the same thing down the page, and the other sections had settled
on a different shape — the rule composer and its editor, and the movement
composer, are dialogs over the page.

The dialogs themselves had a stacking bug that the row editor never had: the
backdrop sat at `z-index: 30`, below the sticky top bar at `40`, and its top
padding on a short window could be smaller than the bar. A dialog opened near
the top of the page therefore slid under the bar and lost its title and close
control.

## Decision

- **Editing a movement opens a dialog, the same one the composer uses.** The
  row's **Edit** button and a double-click on an editable cell both call the same
  opener, and the gesture that was requested — double-click to edit — is
  unchanged; what opens is a dialog instead of a row of inputs.
- **The dialog is the whole movement**, not just the four cells the row revealed:
  account, booking date, amount, payee, note, status and tags. `TransactionFields`
  is the shared form behind **Add transaction** and the edit dialog, exactly as
  `RuleFields` is behind the rule composer and its editor.
- **A currency never changes behind the user's back.** The edit keeps the
  movement's own currency unless the account is changed to one with a different
  default, so a USD movement booked on a EUR account stays USD.
- **The row goes back to being read-only.** The status chip still toggles booked
  and pending in one click, the **Raw** panel is untouched, and editing still
  never re-runs the tagging rules — the dialog says so.
- **A dialog covers the whole viewport.** The backdrop moves above the sticky top
  bar and keeps a top padding that clears it on short screens, so the title is
  never hidden; the top bar is dimmed with the rest of the page while a dialog is
  open.

## Consequences

- The table keeps one shape from the first row to the last, and the four cells
  that used to become inputs no longer move the layout while they are edited.
- `docs/DESIGN.md` documents the dialog among the shared components and the
  ledger's row actions; `docs/TESTING.md` covers the double-click, the prefilled
  fields, the Cancel path and the stacking; `docs/PLAN.md` and `README.md`
  describe the ledger as edited in a dialog.
- A future row action opens a dialog through the same component, so the backdrop
  fix cannot be forgotten on a new surface.
