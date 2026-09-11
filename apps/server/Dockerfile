# Flowly server image: TypeScript service, generated contracts, SQLCipher and the
# built React client served on the same origin. The base image is pinned by its
# multi-architecture index digest so every build resolves the same Node release.
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build

RUN apk add --no-cache python3 make g++ linux-headers openssl-dev
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile --filter "@flowly/server..."
RUN pnpm install --frozen-lockfile --filter "@flowly/web..."
RUN pnpm --filter @flowly/web-contracts build \
    && pnpm --filter @flowly/server build \
    && pnpm --filter @flowly/web build

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
    FLOWLY_VAULT_DIR=/vault \
    FLOWLY_WEB_DIR=/repo/apps/web/dist

RUN mkdir -p /vault && chown -R node:node /vault /repo
USER node
VOLUME ["/vault"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "apps/server/dist/index.js"]
