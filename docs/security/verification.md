# Server MVP verification

What is verified automatically today, what is verified by hand, and what remains
open before a public release.

## Automated

| Area | Where |
| --- | --- |
| Domain invariants (money, dates, tags, rules, budgets) | `apps/server/tests/domain.test.ts`, `money.test.ts`, `tagging-rule.test.ts` |
| Contracts and generated types | `packages/web-contracts/tests/contracts.test.ts` |
| Encrypted storage, migrations, crash atomicity | `apps/server/tests/storage.test.ts` |
| Wrong key, tampering, corrupted database | `apps/server/tests/crypto.test.ts`, `vault.test.ts` |
| No plaintext on disk | `apps/server/tests/no-plaintext.test.ts` |
| Sessions, CSRF, rate limiting, lock and auto-lock | `apps/server/tests/api.test.ts` |
| Optimistic concurrency | `apps/server/tests/api.test.ts`, `vault.test.ts` |
| Tagging rules and backfill | `apps/server/tests/tagging.test.ts` |
| CSV and archive round trips, failure modes | `apps/server/tests/portability.test.ts` |
| Dashboard, search and budgets | `apps/server/tests/analytics.test.ts`, `search.test.ts` |
| API surface and deployment behaviour | `apps/server/tests/api-phase3.test.ts`, `api-phase4.test.ts`, `api-phase5.test.ts` |
| UI behaviour and accessibility structure | `apps/web/src/**/*.test.tsx` |
| License policy and SBOM generation | `pnpm release:check`, `pnpm release:report` |
| Container build on both architectures | `.github/workflows/ci.yml` |

Run everything with `pnpm verify`, then `pnpm build`.

## Manual

1. Deploy with `deployment/self-hosted/compose.yaml` and confirm the browser
   reaches the app over HTTPS with a trusted local CA.
2. Create a vault, restart the stack, confirm the app comes back **locked**, and
   unlock with the same passphrase.
3. Export a complete archive, wipe the volume, restore from the archive.
4. Walk the keyboard path through unlock, a transaction form and the cascade
   confirmations; check focus order and visible focus rings.
5. Read the data-loss warning aloud to a user before they load real data.

## Open items

- A full WCAG 2.2 AA audit with assistive technology (screen reader, high
  contrast) is still pending.
- An independent cryptographic and key-management review has not been performed;
  it is required before a public release.
- Docker Desktop on Windows and a native `amd64` host have not been exercised by
  hand yet; CI builds both architectures.
- Performance on the weakest supported host (Raspberry Pi class) is not
  measured; Argon2id parameters may need tuning there.
