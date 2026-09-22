# ADR 0027 — Rule coverage and the composer's preview are read-only reads

Status: Accepted (2026-09-22)

## Context

The redrawn Rules mockup shows figures the engine has never exposed: how many
transactions each rule matches, what share of the ledger the rules cover, a
breakdown per applied tag, and — while a rule is being written — what that draft
would match. The page cannot invent them: Flowly does not record which rule
tagged which transaction (ADR 0007), so nothing on the stored records says how
often a rule fired, and the client has no copy of the matching rules to count
them with.

Computing them in the browser was never an option either: the matching rules are
the server's domain code (ADR 0026 keeps amounts in exact minor units), and
duplicating them in the React app is how two implementations start to disagree.

## Decision

- **Coverage is derived on the server, over the whole ledger.** `GET
  /api/tagging-rules/stats` evaluates every stored rule against every
  transaction and answers with the transactions that at least one enabled rule
  matches, the match count per rule, and the transactions covered per tag the
  rules apply. A disabled rule is reported with zero matches rather than
  omitted, so the registry can show it.
- **The composer previews the same way, unsaved.** `POST
  /api/tagging-rules/preview` takes the condition set alone — combinator and
  conditions, no identity — validates it with the same `validateConditionSet`,
  and evaluates it with the same `conditionSetMatches` the engine uses, over the
  most recent transactions (100 by default). A preview therefore cannot disagree
  with what saving the rule would do.
- **Both only read.** They list records and count matches; they never write,
  never touch a revision and never apply a tag. Applying stays the explicit
  backfill, unchanged.
- **The editor runs the preview live, and the button keeps it explicit.** The
  composer asks for a preview shortly after typing stops and clears it as soon
  as the draft changes, so the number on screen always belongs to the draft
  being read; a draft the server would refuse is never sent, and a failed read
  stays silent. **Simulate on 100 tx** repeats the read on demand and does
  report the failure.
- **Nothing else changes.** The endpoints are transport payloads of the rules
  module, typed in the web client the way the banking payloads are; the vault
  keeps no coverage state, so there is no schema, migration or format version to
  move.

## Consequences

- The cost of the two reads is a full pass over the ledger, exactly like the
  existing backfill: fine for a personal vault, and the reason the preview is
  bounded to the most recent rows.
- The registry's **Matches** column, the overview's figures and the live
  evaluation line all come from one place, so they cannot drift from each other.
- A native client gets the same numbers from the same endpoints instead of
  re-implementing the evaluation, and `docs/DESIGN.md`, `docs/TESTING.md`,
  `docs/PLAN.md` and `README.md` describe the page as measured rather than
  decorative.
