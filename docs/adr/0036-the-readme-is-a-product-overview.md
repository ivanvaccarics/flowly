# ADR 0036 — The README is a product overview, not a roadmap

Status: Accepted (2026-09-23)

## Context

The README had grown into a second plan. It carried a client-platform table, the
full milestone list with its post-MVP rows, a "how it's built" essay on why a
second client exists, and long prose that restated the design system, the
session mechanics, the pagination sizes and the export shapes — every one of
them already owned by `docs/RUNNING.md`, `docs/DESIGN.md` or `docs/PLAN.md`.

[ADR 0032](./0032-flowly-targets-the-desktop-only.md) removed the mobile target,
but it kept the client-plan material on the front page by renaming it: the
platform table, the Flutter rows, the biometric shortcuts and the desktop
milestones stayed in `README.md`, now saying desktop instead of mobile. A reader
arriving from GitHub met several screens of roadmap before reaching how to run
the product, and the first thing the page promised was a client that does not
exist yet.

## Decision

- **`README.md` describes what ships, and nothing else.** Identity, one
  paragraph of what Flowly is, the six screenshots, the features that work
  today, the security model, how to run it, the repository layout, links into
  `docs/`, the status and the license.
- **The roadmap lives in the plan.** `docs/PLAN.md` and its ADRs hold the phase
  plan, the post-MVP work and the intentions behind them; the README links to
  them instead of restating them.
- **No client-platform material on the front page.** ADR 0032 made the product
  desktop-only and that decision is recorded where decisions belong; the README
  carries no platform table, no phase table and no milestone rows for platforms
  or clients that are not shipped.
- **Details stay with the document that owns them.** Session mechanics,
  pagination sizes, palette hex codes, the Gitleaks configuration and the
  screenshot recipe are not repeated in the README.
- **The page is scannable.** Headings, short bullets, tables and code blocks
  instead of paragraphs; the six screenshots keep one-line captions.

## Consequences

- `README.md` drops from about 430 lines to about 200, and every remaining line
  is either a fact about the shipped product or a pointer to the document that
  owns it.
- The README changes when features, setup, architecture or dependencies change;
  a roadmap shift is a `docs/PLAN.md` change and does not touch the front page.
- The screenshots, their synthetic-vault recipe and the "What it looks like"
  section stay, as ADR 0031 requires; so does the documentation index, with one
  line per document.
- Nothing is lost: the platform and phase material removed from the README is in
  `docs/PLAN.md`, and ADR 0032 keeps the record of the desktop-only decision.
