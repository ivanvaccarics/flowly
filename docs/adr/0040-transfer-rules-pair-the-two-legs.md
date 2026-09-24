# ADR 0040 — A transfer rule pairs the two legs and marks them

Status: Accepted (2026-09-24). Builds on
[ADR 0039](./0039-transfers-stay-out-of-the-flow-figures.md), which gave the
transfer flag its meaning and its three states.

> **Update (2026-09-25).** The rules page edits a transfer rule now. The last
> decision below — a pair rule is listed read-only, because the tagging editor
> holds one condition set — is superseded: the composer offers **Tags** and
> **Transfers**, the two-sided form carries both condition sets and the day
> window, and the edit button opens it for a pair rule the same way it opens the
> tagging form for a match rule. Everything else stands.

## Context

ADR 0039 let a movement be marked as a transfer between the user's own accounts,
and made the flag the user's to set by hand. Doing that for a year of history is
tedious, and the shape of the operation is regular enough to recognise: a
movement leaves one account, another arrives on a different account, the amounts
are equal and opposite, and the two banks describe the other side in their own
words — "Savings transfer" on the current account, "Everyday account" on the
savings one.

What the user wants to write is exactly that sentence: *if the payee contains X
on one side and Y on the other, and one amount is the negative of the other,
these two movements are one transfer*. The amount is never named: one account has
N and the other -N, whatever N is that day.

The existing rule engine cannot express it. It reads one transaction at a time
(`evaluateTaggingRules(rules, transaction)`), every condition is a property of
that single row, and the only action is adding tags. A rule about two rows at
once is a different reading of the same idea, not another condition.

## Decision

- **Rules have a kind.** `formatVersion: 3` adds `kind` to the canonical
  `TaggingRule`: `match` is the rule that existed (conditions over one row,
  adding tags), `transfer-pair` is the new one. A stored v2 rule upgrades to a
  `match` rule on unlock with everything else untouched, and a v1 rule upgrades
  through both steps, so an old vault and an old archive still open.
- **A pair rule carries two condition sets, not one.** `outgoing` describes the
  leg that leaves an account, `incoming` the leg that arrives, and `windowDays`
  (0 to 30, 3 by default) how far apart they may book. It assigns no tags; the
  form of a `match` rule and the form of a `transfer-pair` rule are kept disjoint
  by the domain validator, which is the gate the API and the archive go through.
- **The sign decides the side, and the amount is never written down.** Two legs
  pair when they share a currency, carry exactly opposite amounts in minor units,
  sit on two different accounts, book within the window, and match their own
  side. Nothing is compared approximately and nothing is guessed from the text.
- **Only undecided movements take part, and only once.** A leg whose flag is
  `true` or `false` is the user's answer: a pair needs both legs undecided, so a
  single "no" kills the pair, and one movement belongs to at most one pair.
  Rows are walked by booking date and id, so the same vault always offers the
  same pairs.
- **It runs where movements arrive, and on demand for the past.** A sync marks
  the rows it wrote for an account, and a CSV import marks the batch it created;
  both read the vault across the window, so a pair completes across two syncs or
  two imports. `POST /api/tagging-rules/backfill` walks the whole ledger, which
  is how the history is marked after the rule is written. Nothing runs on an
  update, so editing a transaction never re-marks it.
- **The rules page lists pair rules read-only.** Its editor holds one condition
  set and one tag list; a pair rule is shown as `TRANSFER <outgoing> ⇄ <incoming>
  (±Nd)` with its on/off switch and its delete button, and without an edit
  button, because a form that cannot hold the second side would drop it.

## Consequences

- `apps/server/tests/portability.test.ts` pins the end-to-end case: a CSV with
  both legs and no flag, imported into a vault that holds the rule, comes back
  with both rows marked and `transferPairs: 1` in the report.
  `apps/server/tests/tagging.test.ts` pins the two that matter most — a pair
  marked once, and a pair refused because the user had already said "not a
  transfer" — and `tagging-rule.test.ts` covers the matching itself.
- Deleting a rule does not clear the flags it set. The flag is the row's, there
  is no provenance on it, and the user can change it; that is the deliberate cost
  of keeping the row shape small.
- The amounts must match exactly, in the same currency. A bank that books a
  transfer with a fee, or reports it in a different currency, does not pair; the
  row stays undecided and can be marked by hand.
- Nothing in the vault records which rule marked a row, so the coverage count
  answers "what would this rule pair right now", not "what did it do in the
  past".
- The statistics endpoint counts a pair rule as two rows per pair, because a
  pair covers two movements, and the backfill report separates the tags it added
  from the pairs it marked.
