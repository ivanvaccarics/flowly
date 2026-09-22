# ADR 0030 — One click opens the movement editor

Status: Accepted (2026-09-22). Supersedes the gesture in
[ADR 0029](./0029-a-movement-is-edited-in-a-dialog.md).

## Context

ADR 0029 moved the movement editor into a dialog but kept the double-click that
the row editor had used: the first click on a payee, note, tag or amount cell
did nothing visible, and the second opened the dialog. A dialog is not the row
changing under the pointer any more — the reason the gesture needed two clicks
is gone, and a single click is what a person tries first on a cell they want to
correct.

## Decision

- **One click on a cell the dialog can change opens the editor.** The date,
  payee, note, tags and amount cells are the movement, so a click on any of them
  opens the dialog prefilled; the row's **Edit** button keeps doing the same and
  stays the keyboard-reachable way in.
- **A cell with an action of its own keeps it.** The status chip still switches
  booked ↔ pending on a single click and never opens the editor; the **Raw**
  button, the delete button and the source chip are unchanged.
- **The hint says so.** The ledger's card header reads "click the date, payee,
  note, tags or amount to edit the movement" instead of naming a double-click.

## Consequences

- Selecting text inside a row cell no longer selects it: the first click opens
  the dialog, where the same value can be copied from the field. The **Raw**
  panel and the dialog itself keep their text selectable.
- A click anywhere on a row now either edits the movement or belongs to a
  control inside it, so there is no dead click.
- `docs/DESIGN.md`, `docs/TESTING.md`, `docs/PLAN.md` and `README.md` describe
  the single click, and the test that covered the double-click now clicks once
  and asserts that the status chip still only toggles.
