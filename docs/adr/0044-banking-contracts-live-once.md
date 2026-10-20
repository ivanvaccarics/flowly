# ADR 0044 — Banking contracts live once and are checked at runtime

Status: Accepted (2026-10-20)

## Context

The server and browser client had independently declared the banking transport
shapes. The two sets were structurally similar but could drift without a
compiler error, and `request<T>` trusted every decoded JSON document as `T`.
Existing contract validators covered persisted records and analytics payloads
but not the Enable Banking status, authorization, account-mapping, sync or raw
provider-record responses.

## Decision

- **`contracts/schemas/banking.schema.json` is the single source of truth for
  banking transport shapes.** Its named definitions cover the public connection,
  account and link summaries, sync report, status, ASPSP catalogue,
  authorization result, raw provider record, request inputs and response
  envelopes.
- **Generated TypeScript is the only declaration used by the server and web
  client.** Compatibility aliases in the web API client may narrow or omit a
  path-bound field, but they may not redeclare the wire shape.
- **The browser validates known JSON contracts before returning them.** Vault
  status, dashboard and expense details use `validateClientContract`; each
  banking endpoint names its definition to `validateBankingContract`. A mismatch
  becomes an `ApiError` with code `contract_violation` before the payload
  reaches UI state.
- **The browser imports a generated client validator subset.** AJV emits
  standalone validation functions at contract-generation time, so the full AJV
  engine is not shipped in the web bundle.
- **Binary downloads stay outside JSON validation.** CSV, ZIP and encrypted
  archive responses continue to use their format-specific handling.

## Consequences

- A server response that omits a required banking field now fails immediately
  and visibly instead of surfacing later as an undefined property in the UI.
- Adding a banking field requires one schema change, regeneration and a fixture
  update when the field changes what clients must accept.
- The browser and server can share generated types because
  `packages/web-contracts` is already a workspace dependency of both.
- The contract layer grows by one schema file, a generated client-validator
  subset and focused tests; it adds no new package dependency.
