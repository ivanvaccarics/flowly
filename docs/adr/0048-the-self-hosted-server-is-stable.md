# ADR 0048 — The self-hosted server is stable

Status: Accepted (2026-11-20)

## Context

The project shipped the self-hosted server through Phase 6, including Enable
Banking, automatic transfer pairing and the Details analytics. Since the v1.1
baseline it has also received forward-only schema recovery, retired-rule
migration, contract-boundary hardening, loading and runtime refactors, and a
new detail-chart interaction. The full gate currently passes 349 automated
tests, the production build, the license policy and a live 17-check acceptance
run.

The maintainer reports roughly two months of continuous daily use. That use is
operational evidence for the supported deployment, not a substitute for an
audit. The user-facing documentation still calls the product "early
development", and several operational pages describe an older MVP phase, test
count and acceptance behaviour.

The repository also contains planned desktop work and automatic backups, and it
has two external qualifications that have not been completed: an independent
cryptographic review and a full assistive-technology audit. Those are real gaps
in what the project may claim, but they do not describe the code that is shipped
or the support boundary it already documents.

## Decision

- Declare the self-hosted server through Phase 6 **stable for private LAN or VPN
  use**, effective 2026-11-20.
- Treat the encrypted vault, finance flows, dashboard and Details, search,
  tagging rules, transfers, import/export, sessions and Enable Banking connector
  as released features.
- Keep manual encrypted archive export as the supported backup. The desktop
  application and automatic encrypted backups remain planned, not released.
- State the residual qualification gaps explicitly. Stable does not mean
  independently audited, WCAG-certified, benchmarked on every host, or suitable
  for direct public Internet exposure.
- Align README, PLAN, RUNNING, TESTING, deployment, support and verification
  documentation with the actual release, current 349-test gate and 17-check
  acceptance suite.

## Consequences

- Users get one clear status: the server is ready for its supported self-hosted
  use, while future platforms and features are visibly separate.
- The project does not overstate security or accessibility certification.
- Release changes remain forward-only and versioned. This decision does not
  change the vault schema, export format or runtime version.
- Any future change to the stability claim must be recorded rather than silently
  rewriting this decision.
