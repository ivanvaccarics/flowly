# ADR 0038 — CI validates the container image on native runners, cached from the published one

Status: Accepted (2026-09-24). Complements
[ADR 0009](./0009-deployment-transport-and-release.md): the same image, the same
evidence, built once per change instead of twice.

## Context

Every pull request and every push to `main` ran the `containers` job of
`.github/workflows/ci.yml`, which built `linux/amd64` and `linux/arm64` in a
single `docker/build-push-action` step on `ubuntu-latest`. That step had no
`cache-from` and no `cache-to`, so each run compiled SQLCipher from source for
both architectures, and the `linux/arm64` leg ran emulated on an x86 runner.

The measurement, from a run of 23 September 2026 and from a local cold build on
an 8-core Apple Silicon machine:

| What | Time |
| --- | --- |
| CI run, whole pipeline | 18 min |
| — `Build container images` job | 18.4 min |
| — — its one build step | 18.2 min |
| — `Verify workspace` job, same run | 1.1 min |
| `Container image` workflow, same commit, cache in place | 1–4 min |
| Local cold `linux/arm64` build, native | 92.6 s |
| — the `pnpm install --filter "@flowly/server..."` step, which compiles SQLCipher | 68 s (73 %) |
| Local cold `linux/amd64` build, emulated | 134 s |
| Local rebuild, same sources, warm cache | 0.4 s |

The SQLCipher amalgamation is a single 9.6 MB translation unit, so no amount of
parallelism or CPU shortens it; only compiling it less often does. The
`.github/workflows/image.yml` workflow already proved both halves of the fix: it
builds each architecture on a runner of that architecture and it carries a
GitHub Actions cache, which is why the same image costs it one minute.

## Decision

- **One job per architecture, on a native runner.** The `containers` job of
  `.github/workflows/ci.yml` becomes a matrix: `linux/amd64` on `ubuntu-latest`,
  `linux/arm64` on `ubuntu-24.04-arm`, exactly as `image.yml` does it. QEMU
  leaves the pipeline, and the two legs run in parallel.
- **The cache is read, never written.** The job takes
  `cache-from: type=gha,scope=<arch>` and no `cache-to`. Those are the scopes
  `image.yml` grows on `main`, so a pull request usually finds the layers up to
  and including the compile already built. Pull requests never write: the cache
  budget is 10 GB per repository, and PR-scoped entries would evict the main
  entry that everything else depends on.
- **A push to `main` does not build the image twice.** The job runs on
  `if: github.event_name == 'pull_request'`. On `main`, `image.yml` builds the
  same Dockerfile for the same two architectures on the same runners and
  publishes the result, so the CI job there only repeated work that was about to
  happen anyway — with worse caching.
- **Pull requests keep what they were really checking.** Both architectures are
  still built from the same `apps/server/Dockerfile`, still with `provenance` and
  `sbom` attestations enabled, so a Dockerfile that only breaks under musl or on
  arm64 still fails the pull request.

## Consequences

- The pipeline on a pull request drops from ~18 min to the time of the slowest
  architecture, expected around 1–2 min: the base image, the toolchain, both
  `pnpm install` passes and the SQLCipher compile arrive as cache hits, and only
  the workspace builds run again.
- On `main` the CI workflow is `Verify workspace` alone (~1 min); the container
  build lives in the Container image workflow, which is the one that publishes.
- A pull request that changes the lockfile misses the install layers and pays one
  cold SQLCipher compile per architecture, natively. That is the honest price of
  the check, and `FLOWLY_BUILD_CFLAGS=-O1` (see `docs/AUTOMATIC_STARTUP.md`)
  remains the way to shorten it where that trade is wanted.
- The check names change: `Build container images` becomes `Build linux/amd64`
  and `Build linux/arm64`. A branch protection rule that required the old name
  has to be updated.
- If the GitHub Actions cache is evicted or unavailable, pull requests fall back
  to cold native builds (~1.5 min per architecture on a fast runner, more on the
  arm64 runner) rather than to emulation. Publishing a base image with SQLCipher
  already compiled — a `ghcr.io/.../flowly-deps` tag keyed by the lockfile — is
  the next step if that ever becomes the normal case; it was not needed here.
- `image.yml` gains no behaviour from this: it keeps publishing the manifest list
  and the source stamp, and now shares its cache scopes with the pull-request
  build instead of with a second identical build on `main`.
