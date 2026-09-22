# ADR 0026 — A rule's amount condition is a decimal amount, not a count of minor units

Status: Accepted (2026-09-22)

## Context

Tagging rules matched amounts through a `amountMinor` condition that stored a
signed integer count of minor units, mirroring how transactions persist money
(`-50000` meant an outflow of 500.00 EUR). The rule editor inherited that
representation: the value field passed what was typed through `Number` and the
input could only hold an integer, so "amount less than -5.10" could not be
written. The number a person reads in the ledger is 5.10, not 510, and the rest
of the product already says "amount" — in `README.md`, in the dashboard's
filters and in the rule tile itself.

## Decision

- **The condition field is `amount` and its value is a canonical decimal string
  in the condition's own currency** — `{ "field": "amount", "operator":
  "lessThan", "value": "-5.10", "currency": "EUR" }`. The rule says what a
  person would write; the currency keeps it unambiguous without a conversion.
- **The engine still compares exact minor units.** Both sides go through
  `parseAmountToMinor`, the same currency-aware parser the CSV and account
  imports use, so no binary floating point ever enters evaluation, "-5.10" and
  "-510" for EUR are the same money, and a value the currency cannot hold
  (`-5.105` EUR, `5.5` JPY) or an unsupported currency is rejected instead of
  rounded.
- **The editor keeps what the person typed.** The draft holds the raw text, the
  client normalises a decimal comma to a dot, checks the currency's decimal
  places and refuses a non-numeric amount before calling the API, and the
  decimal string round-trips unchanged through the edit dialog.
- **Tagging rules move to `formatVersion` 2.** This is a breaking change to a
  persisted record, so the schema, the fixture, the generated contracts and the
  golden evaluation vectors move with it; `expected-results/tagging-rule-
  evaluation.json` gains a decimal case and a near-miss that proves the
  comparison is exact.
- **Stored version 1 rules are upgraded, not dropped.** On unlock and on archive
  import the server rewrites an `amountMinor` condition into `amount` with the
  minor value formatted in its currency (`-50000` EUR becomes `"-500.00"`), and
  the rewrite bumps the rule's revision like any other write. A rule whose
  legacy amount cannot be converted — an unsupported currency — is left
  untouched so the vault still opens.

## Consequences

- Changing a rule's amount from 50000 to "-5.10" is an API break: clients that
  wrote version 1 rules must send version 2. The vault upgrade means existing
  vaults keep matching, and archives written before this change still import.
- `contracts/schemas/tagging-rule.schema.json`, its fixture, the generated
  web contracts and the golden vectors are the specification; `docs/PLAN.md`,
  `docs/TESTING.md`, `README.md` and `contracts/README.md` describe the new
  field.
- The rule editor no longer mirrors the transaction record's minor units, so a
  future native client must parse the decimal string with the same
  currency-aware rules rather than with its own float parsing.
