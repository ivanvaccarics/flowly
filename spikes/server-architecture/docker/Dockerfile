FROM node:22.9-alpine AS build

RUN apk add --no-cache python3 make g++ linux-headers openssl-dev

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY docker ./docker

FROM node:22.9-alpine AS runtime

RUN apk add --no-cache libstdc++ libcrypto3

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src ./src
COPY --from=build /app/docker ./docker

# The runtime only needs the compiled addon, not SQLCipher sources or objects.
RUN rm -rf /app/node_modules/@journeyapps/sqlcipher/{deps,src,tools,binding.gyp} \
    && find /app/node_modules/@journeyapps/sqlcipher -name '*.o' -delete \
    && find /app/node_modules/@journeyapps/sqlcipher -name '*.a' -delete

RUN mkdir -p /vault && chown -R node:node /vault /app

USER node
VOLUME ["/vault"]

ENTRYPOINT ["node", "--no-warnings", "--experimental-strip-types", "--experimental-sqlite", "docker/smoke.ts"]
CMD ["create"]
