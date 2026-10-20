# ADR 0047 — Retired version-3 match rules upgrade on unlock

Status: Accepted (2026-10-20)

## Context

A short-lived prototype stored tagging rules as format version 3 with an
additional `kind` field. The feature was reverted and current rules returned to
format version 2, but two version-3 `match` rules had already been persisted in
an encrypted vault. The Rules endpoint returned those records, and the current
client rejected the collection because of the extra field and the unsupported
format version.

Reading through the storage repository does not validate records. This is
deliberate: an odd stored record must not prevent the vault from opening.
The response boundary still has to uphold the current API contract.

## Decision

- Upgrade a stored version-3 rule with `kind: "match"` to the current version-2
  shape when the vault is unlocked.
- Preserve every meaningful v2 field and remove only the retired prototype
  fields: `kind`, `outgoing`, `incoming` and `windowDays`.
- Do not convert a version-3 `transfer-pair` rule. The prototype was replaced by
  automatic transfer pairing, and inventing tags or match conditions for the old
  record would change its meaning.
- Never delete an incompatible record during best-effort upgrade. It remains in
  the encrypted vault, while the current matching service and Rules collection
  expose only records that satisfy the current domain contract.
- Read the Rules collection through the validated tagging service rather than
  returning raw storage records.

## Consequences

- The rules created by the retired prototype become visible and editable again
  with their original conditions and tags.
- One unknown or future rule shape can no longer take down the whole Rules view
  or the tagging engine.
- An obsolete `transfer-pair` rule is preserved on disk but is not shown or
  executed by this version. Automatic transfer pairing remains the supported
  behaviour.
- Unlock performs one best-effort rewrite per converted rule, with the normal
  revision check; a conversion that fails validation is left untouched.
- `apps/server/tests/tagging-rule.test.ts`, `tagging.test.ts` and
  `api-phase3.test.ts` cover the conversion, preservation and API boundary.
