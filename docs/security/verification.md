# Stable self-hosted server verification

What is verified for the stable private-network release, what is verified by
hand, and which broader qualification claims remain open. The release boundary
is recorded in [ADR 0048](../adr/0048-the-self-hosted-server-is-stable.md).

## Automated

| Area | Where |
| --- | --- |
| Domain invariants (money, dates, tags, rules) | `apps/server/tests/domain.test.ts`, `money.test.ts`, `tagging-rule.test.ts` |
| Contracts and generated types | `packages/web-contracts/tests/contracts.test.ts` |
| Encrypted storage, migrations, crash atomicity | `apps/server/tests/storage.test.ts` |
| Wrong key, tampering, corrupted database | `apps/server/tests/crypto.test.ts`, `vault.test.ts` |
| No plaintext on disk | `apps/server/tests/no-plaintext.test.ts` |
| Sessions, CSRF, rate limiting, lock and auto-lock | `apps/server/tests/api.test.ts` |
| Optimistic concurrency | `apps/server/tests/api.test.ts`, `vault.test.ts` |
| Tagging rules and backfill | `apps/server/tests/tagging.test.ts` |
| CSV and archive round trips, failure modes | `apps/server/tests/portability.test.ts` |
| Plain-text tables ZIP structure, checksums and CRCs | `apps/server/tests/export-tables.test.ts` |
| Dashboard and search | `apps/server/tests/analytics.test.ts`, `search.test.ts` |
| API surface and deployment behaviour | `apps/server/tests/api-phase3.test.ts`, `api-phase4.test.ts`, `api-phase5.test.ts` |
| UI behaviour and accessibility structure | `apps/web/src/**/*.test.tsx` |
| End-to-end acceptance run | `tooling/scripts/acceptance.mjs` (17 checks against a running server) |
| License policy and SBOM generation | `pnpm release:check`, `pnpm release:report` |
| Container build on both architectures | `.github/workflows/ci.yml` (pull requests), `.github/workflows/image.yml` (`main`, tags) |

Run everything with `pnpm verify`, then `pnpm build`. The current suite is 349
tests: 15 contract, 233 server and 101 web.

`pnpm release:report` writes `sbom.json` and `third-party-licenses.md` without a
timestamp and without platform-specific optional bindings (`@esbuild/darwin-arm64`,
`@node-rs/argon2-linux-x64-gnu`, `fsevents`, …), so the same lockfile produces
the same bytes on every operating system. CI regenerates both files on Ubuntu
and fails when they differ from the committed ones
(`git diff --exit-code -- docs/security`). The container build publishes the
SBOM of the shipped image separately, through buildx.

To reproduce the CI result on a machine where Docker is available (useful when
the report changes unexpectedly), run the generation inside a Linux container
and diff the result against the committed files:

```bash
docker run --rm -v "$PWD":/src:ro node:22-bookworm bash -lc '
  mkdir -p /work && cd /src &&
  tar -cf - --exclude=node_modules --exclude=.git --exclude=data . | tar -xf - -C /work &&
  cd /work && corepack enable && pnpm install --frozen-lockfile &&
  pnpm release:report &&
  diff docs/security/sbom.json /src/docs/security/sbom.json &&
  diff docs/security/third-party-licenses.md /src/docs/security/third-party-licenses.md'
```

## Manual

1. Deploy with `deployment/self-hosted/compose.yaml` and confirm the browser
   reaches the app over HTTPS with a trusted local CA.
2. Create a vault, restart the stack, confirm the app comes back **locked**, and
   unlock with the same passphrase.
3. Export a complete archive, wipe the volume, restore from the archive.
4. Walk the keyboard path through unlock, a transaction form and the cascade
   confirmations; check focus order and visible focus rings.
5. Read the data-loss warning aloud to a user before they load real data.

## Release qualification not yet claimed

- A full WCAG 2.2 AA audit with assistive technology (screen reader, high
  contrast) is not part of the stable-release claim.
- An independent cryptographic and key-management review has not been performed;
  the project does not claim independent certification.
- Docker Desktop on Windows and a native `amd64` host have not been exercised by
  hand here; CI builds both architectures, while the manual deployment evidence
  covers the hosts named in the test report.
- Performance on the weakest supported host (Raspberry Pi class) is not
  benchmarked; Argon2id parameters may need tuning there.

These items do not block the supported private-network self-hosted release, but
they do block any claim of independent security certification, complete
assistive-technology conformance or broad platform benchmarking. Direct public
Internet exposure remains unsupported.
