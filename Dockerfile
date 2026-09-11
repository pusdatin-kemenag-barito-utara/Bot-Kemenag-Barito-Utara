# =============================================================
# PTSP WhatsApp Bot — Backend (Go Fiber v3 + whatsmeow)
# Multi-stage build:
#   stage frontend (node) -> bangun Astro static ke ./web/public
#   stage builder (golang) -> binary statis
#   stage runtime (alpine) -> slim, ca-certificates untuk TLS WhatsApp
# whatsmeow tersimpan di Postgres (sqlstore), jadi runtime tak butuh file sesi.
# =============================================================

# --- Stage 1: Frontend build (Astro 7 + React) ---
FROM node:22-alpine AS frontend

WORKDIR /fe

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

ARG PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG PUBLIC_PUSDATIN_URL
ARG PUBLIC_PUSDATIN_APP_ID

ENV PUBLIC_TURNSTILE_SITE_KEY=$PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV PUBLIC_PUSDATIN_URL=$PUBLIC_PUSDATIN_URL
ENV PUBLIC_PUSDATIN_APP_ID=$PUBLIC_PUSDATIN_APP_ID

COPY frontend/ .
RUN npm run build

# --- Stage 2: Go build ---
FROM golang:1.27-alpine AS builder

WORKDIR /build

# Cache dependencies dulu (lapisan ini hanya berubah saat go.mod/go.sum berubah).
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Salin source lalu build binary statis.
COPY backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" \
    -o /out/ptsp-wa-bot ./cmd/server

# --- Stage 3: Runtime ---
# alpine + ca-certificates karena whatsmeow melakukan TLS ke WhatsApp.
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata curl bash && \
    curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | bash && \
    apk add --no-cache infisical && \
    adduser -D -u 10001 appuser

WORKDIR /app

COPY --from=builder /out/ptsp-wa-bot /usr/local/bin/ptsp-wa-bot
# Frontend build dari stage 1 (outDir Astro diresolusi ke /backend/web/public).
COPY --from=frontend /backend/web/public ./web/public

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER appuser

EXPOSE 8080

ENTRYPOINT ["docker-entrypoint.sh"]