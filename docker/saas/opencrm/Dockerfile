# ============================================================
# Self-hosted Node fork of clawnify/open-crm.
# Upstream commit vendored: 0f57bb6518f11b208282b7f9ea7d2731696307d6
# Divergences:
#   - src/server/db.ts swapped to better-sqlite3
#   - src/server/server.ts added (node-server entrypoint, schema bootstrap,
#     static + SPA fallback)
#   - src/server/index.ts: type Env.Bindings.DB loosened to `unknown?`
# ============================================================
FROM node:20-alpine AS build

RUN apk add --no-cache python3 make g++ \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate

WORKDIR /src

COPY docker/saas/opencrm/package.json docker/saas/opencrm/pnpm-lock.yaml* ./
RUN CI=true pnpm install

COPY docker/saas/opencrm/ ./
RUN pnpm run build

# ============================================================
# Runtime — slim image with just the compiled output + native module
# ============================================================
FROM node:20-alpine

RUN apk add --no-cache tini

WORKDIR /app

COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/dist        ./dist
COPY --from=build /src/dist-server ./dist-server
COPY --from=build /src/src/server/schema.sql ./schema.sql
COPY --from=build /src/package.json ./package.json

ENV NODE_ENV=production \
    OPENCRM_DB_PATH=/data/opencrm.db \
    OPENCRM_PORT=8787 \
    OPENCRM_STATIC_ROOT=/app/dist \
    OPENCRM_SCHEMA_PATH=/app/schema.sql

EXPOSE 8787

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist-server/server/server.js"]
