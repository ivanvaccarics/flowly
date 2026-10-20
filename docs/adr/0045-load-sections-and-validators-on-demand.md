# ADR 0045 — Sections and client validators load on demand

Status: Accepted (2026-10-20)

## Context

All web sections and generated JSON validators were imported into the initial
bundle. The application therefore downloaded and parsed Details, Banking,
Settings, every chart and the complete client validator set before a person
could use the dashboard. Code splitting views alone was not enough because the
validators still dominated the main chunk.

## Decision

- **Every app section is lazy.** Dashboard, Details, Accounts, Transactions,
  Tags, Rules, Settings and the bank callback are dynamic imports wrapped in a
  local `Suspense` boundary.
- **The initial dashboard remains the first section loaded.** It is not eagerly
  imported into the shell; it arrives as its own chunk immediately after unlock.
- **Response validation is deferred until the first JSON response.** The API
  client dynamically imports the validator facade before returning a payload.
  Generated validators therefore live in a separate cacheable chunk.
- **Loading preserves navigation semantics.** The Settings anchor is retained
  until its target exists, then applied and cleared, so asynchronous loading can
  still land on the export block.

## Consequences

- The initial JavaScript chunk fell from roughly 591 KB to 244 KB uncompressed
  and from 105 KB to 77 KB gzip.
- Validators form a separate 348 KB uncompressed, 28 KB gzip chunk loaded when
  the first API response arrives.
- No main chunk exceeds Vite's 500 KB warning threshold.
- A slow first request now waits for a local validator chunk. The chunk is
  cached by the browser and the trade-off is accepted for lower startup work.
