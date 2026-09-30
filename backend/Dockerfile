# syntax=docker/dockerfile:1.7
# ════════════════════════════════════════════════════════════════════════
#  Cholo API image (build context: backend/)
#
#  deps    → full npm ci (dev deps: nest cli, prisma cli, tsc)
#  build   → prisma generate + nest build + compiled seed
#  runtime → node:20-alpine, prod deps only, non-root, tini as PID 1
#
#  The same image runs three roles:
#    api      (default CMD)                 node dist/main.js
#    migrate  docker compose run migrate    npx prisma migrate deploy
#    seed     docker compose run seed       node seed/seed.js
# ════════════════════════════════════════════════════════════════════════
ARG NODE_VERSION=20.19-alpine3.21

# ───────────── deps ─────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
# python3/make/g++: native addons (argon2) compile if no matching prebuild exists
RUN apk add --no-cache openssl libc6-compat python3 make g++
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN --mount=type=cache,target=/root/.npm,sharing=locked npm ci --no-audit --no-fund

# ───────────── build ─────────────
FROM deps AS build
WORKDIR /app
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate \
 && npx nest build \
 && npx tsc -p prisma/seed/tsconfig.json \
 && mkdir -p dist-seed/data && cp prisma/seed/data/*.json dist-seed/data/

# ───────────── prod-deps ─────────────
# Same toolchain as deps (native addons built once), then drop dev packages.
FROM deps AS prod-deps
WORKDIR /app
RUN npm prune --omit=dev --no-audit --no-fund && npm cache clean --force

# ───────────── runtime ─────────────
FROM node:${NODE_VERSION} AS runtime
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="cholo-api" \
      org.opencontainers.image.description="Cholo (চলো) commerce API — NestJS + Prisma + PostgreSQL" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="https://github.com/cholo-shop/cholo" \
      org.opencontainers.image.licenses="UNLICENSED"

RUN apk add --no-cache tini openssl libc6-compat

ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    PORT=4000 \
    OTEL_PROMETHEUS_PORT=9464 \
    NODE_OPTIONS="--enable-source-maps" \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma/schema.prisma ./prisma/schema.prisma
# prod deps (incl. the prisma CLI for `migrate deploy`), already compiled in the prod-deps stage
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules

# generated client (+ native query engine for linux-musl) from the build stage
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-seed ./seed
COPY --chown=node:node prisma ./prisma

# uploads volume mount point (served by the API under /uploads)
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node

EXPOSE 4000 9464

HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/v1/health/live" >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# -r loads OpenTelemetry before express/http/pg are required
CMD ["node", "-r", "./dist/instrumentation.js", "dist/main.js"]
