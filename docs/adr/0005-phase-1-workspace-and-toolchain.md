# ADR 0005 — Phase 1 workspace, toolchain and contract pipeline

Status: Accepted (Phase 1)

## Context

Phase 1 creates the production workspace that every later phase builds on. It
had to pick a package manager, a runtime floor, a TypeScript version, an HTTP
layer, and a way to turn the language-neutral contracts into code that both the
server and the tests actually use.

## Decision

- **Workspace:** pnpm workspaces with `apps/server`, `apps/web` and
  `packages/web-contracts`, driven from the root by `pnpm dev`, `pnpm build`,
  `pnpm test`, `pnpm lint`, `pnpm contracts:generate` and `pnpm verify`.
- **Runtime floor:** Node.js 22.12 or newer. Vite 8 requires it, and it is the
  first 22.x line with `require(esm)` support for CommonJS test tooling.
- **TypeScript:** pinned to 6.0.3. TypeScript 7 is available but
  `typescript-eslint` 8.x declares support only up to `<6.1.0`, and type-aware
  linting is worth more than the newest compiler.
- **HTTP layer:** Fastify 5 for the same-origin JSON API. It keeps routing,
  validation hooks and test injection in one place, and the domain layer imports
  no HTTP or storage API.
- **Contracts:** JSON Schema 2020-12 in `contracts/` stays the source of truth.
  `json-schema-to-typescript` generates `packages/web-contracts/src/generated`,
  Ajv 2020 compiles the same schemas into runtime validators, and the generated
  output is committed and re-diffed in CI so it cannot drift.
- **Tests:** Vitest everywhere; React component tests run on `happy-dom`
  because jsdom 30 requires `require(esm)`, which Node 22.9 does not provide.
- **Container:** a multi-stage Alpine image that installs the workspace, builds
  the contracts and the server, and copies the per-package `node_modules`
  symlinks pnpm creates — copying only the root `node_modules` produces an image
  that fails at startup.

## Consequences

- Node 22.9 can still run the workspace, but Vite prints a version warning;
  upgrading the local runtime removes it and matches the container image.
- Adopting TypeScript 7 waits for `typescript-eslint` support.
- Any change to `contracts/` requires regenerating and committing the generated
  types; CI enforces it. Dart generation in Phase 8 consumes the same files.
- The Phase 1 image is not yet the release image: the production image
  hardening, HTTPS termination and static web serving land in Phase 5.
