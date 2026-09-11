# Flowly server image: TypeScript service, generated contracts and SQLCipher.
FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++ linux-headers openssl-dev
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile --filter "@flowly/server..."
RUN pnpm --filter @flowly/web-contracts build \
    && pnpm --filter @flowly/server build

FROM node:22-alpine AS runtime

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

# Inside the container the service must accept connections from the published
# port; the supported deployment publishes it on a private interface only.
ENV FLOWLY_HOST=0.0.0.0 \
    FLOWLY_ALLOW_PUBLIC_BIND=true \
    FLOWLY_PORT=8787 \
    FLOWLY_VAULT_DIR=/vault

RUN mkdir -p /vault && chown -R node:node /vault /repo
USER node
VOLUME ["/vault"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1

CMD ["node", "apps/server/dist/index.js"]
