# Flowly server image: TypeScript service, generated contracts, SQLCipher and the
# built React client served on the same origin. The base image is pinned by its
# multi-architecture index digest so every build resolves the same Node release.
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

RUN apk add --no-cache python3 make g++ linux-headers openssl-dev
RUN corepack enable
WORKDIR /repo

# Manifests and the lockfile come first, so the dependency layers below survive
# every source change: without this, editing one file re-ran both installs.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/web-contracts/package.json packages/web-contracts/

# SQLCipher ships no prebuilt binary on any platform: its install script is
# `node-gyp rebuild`, and that compiles a 9 MB amalgamation with 270k lines of C
# in one translation unit. A lighter optimisation level shortens the wait a lot
# on a slow or memory-tight host (a Raspberry Pi 3, for example): put
# FLOWLY_BUILD_CFLAGS=-O1 in .env and rebuild.
ARG FLOWLY_BUILD_CFLAGS=""
RUN CFLAGS="${FLOWLY_BUILD_CFLAGS}" CXXFLAGS="${FLOWLY_BUILD_CFLAGS}" \
    pnpm install --frozen-lockfile --filter "@flowly/server..."
RUN pnpm install --frozen-lockfile --filter "@flowly/web..."

# Sources last, one workspace package at a time and in dependency order, so a
# source change never re-runs the installs above and only the packages from the
# changed one onwards are rebuilt.
COPY tsconfig.base.json ./
COPY packages/web-contracts/ packages/web-contracts/
RUN pnpm --filter @flowly/web-contracts build

COPY apps/web/ apps/web/
RUN pnpm --filter @flowly/web build

COPY apps/server/ apps/server/
RUN pnpm --filter @flowly/server build

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runtime

LABEL org.opencontainers.image.title="Flowly server" \
      org.opencontainers.image.description="Self-hosted Flowly server: encrypted vault, API and web client" \
      org.opencontainers.image.source="https://github.com/flowly/flowly" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.documentation="docs/RUNNING.md"

RUN apk add --no-cache libstdc++ libcrypto3
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/server/package.json ./apps/server/package.json
COPY --from=build /repo/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /repo/apps/server/dist ./apps/server/dist
COPY --from=build /repo/packages/web-contracts/package.json ./packages/web-contracts/package.json
COPY --from=build /repo/packages/web-contracts/node_modules ./packages/web-contracts/node_modules
COPY --from=build /repo/packages/web-contracts/dist ./packages/web-contracts/dist
COPY --from=build /repo/apps/web/dist ./apps/web/dist

# Inside the container the service must accept connections from the published
# port; the supported deployment publishes it on a private interface only.
ENV FLOWLY_HOST=0.0.0.0 \
    FLOWLY_ALLOW_PUBLIC_BIND=true \
    FLOWLY_PORT=8787 \
    FLOWLY_VAULT_DIR=/data/vault \
    FLOWLY_WEB_DIR=/repo/apps/web/dist

RUN mkdir -p /data/vault && chown -R node:node /data /repo
USER node
# Mount the host project's data/ folder here; see deployment/self-hosted/compose.yaml.
VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "apps/server/dist/index.js"]

# Which sources produced this image. Last on purpose: changing the stamp only
# adds this small metadata layer instead of invalidating the ones above, and
# deployment/self-hosted/startup.sh reads it to decide whether to rebuild.
ARG FLOWLY_SOURCE_STAMP=unknown
LABEL org.flowly.source-stamp=$FLOWLY_SOURCE_STAMP
