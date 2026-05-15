# ============================================================
# Stage 1: Build admin UI (Node.js + pnpm)
# ============================================================
FROM node:24-alpine3.23 AS frontend

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /src/web/saas-admin

COPY web/saas-admin/package.json web/saas-admin/pnpm-lock.yaml ./
RUN CI=true pnpm install --frozen-lockfile

COPY web/saas-admin/ ./
RUN pnpm build

# ============================================================
# Stage 2: Build Go binaries (Picoclaw SaaS + tenantctl)
# ============================================================
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git

WORKDIR /src

COPY go.mod go.sum* ./
RUN go mod download

COPY . .

# Replace the placeholder dist with the real built frontend.
RUN rm -rf web/saas-admin/dist
COPY --from=frontend /src/web/saas-admin/dist web/saas-admin/dist

# Mirror the embed expectation: internal/saas/api/spa.go does `//go:embed all:dist`
# relative to itself, so the built dist must end up at internal/saas/api/dist.
RUN mkdir -p internal/saas/api/dist && cp -r web/saas-admin/dist/* internal/saas/api/dist/

RUN CGO_ENABLED=0 go build -ldflags "-s -w" -o /out/picoclaw-saas ./cmd/picoclaw-saas && \
    CGO_ENABLED=0 go build -ldflags "-s -w" -o /out/picoclaw-tenantctl ./cmd/picoclaw-tenantctl

# ============================================================
# Stage 3: Minimal runtime
# ============================================================
FROM alpine:3.23

RUN apk add --no-cache ca-certificates tzdata curl

COPY --from=builder /out/picoclaw-saas /usr/local/bin/picoclaw-saas
COPY --from=builder /out/picoclaw-tenantctl /usr/local/bin/picoclaw-tenantctl

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/picoclaw-saas"]
