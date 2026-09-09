#!/bin/sh
set -e

API_DOMAIN="${INFISICAL_API_URL:-${INFISICAL_HOST_URL:-https://env.kemenag-baritoutara.com}}"
ENV_TARGET="${INFISICAL_ENV:-prod}"
PROJECT_ID="${INFISICAL_PROJECT_ID}"

CLIENT_ID="${INFISICAL_CLIENT_ID:-$INFISICAL_UNIVERSAL_AUTH_CLIENT_ID}"
CLIENT_SECRET="${INFISICAL_CLIENT_SECRET:-$INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET}"

# Otomatis inject jika ada INFISICAL_TOKEN atau Universal Auth (CLIENT_ID + CLIENT_SECRET)
if [ -n "$INFISICAL_TOKEN" ] || [ -n "$CLIENT_ID" ]; then
    PROJECT_ARG=""
    if [ -n "$PROJECT_ID" ]; then
        PROJECT_ARG="--projectId=$PROJECT_ID"
    fi
    if [ -n "$CLIENT_ID" ]; then
        export INFISICAL_CLIENT_ID="$CLIENT_ID"
        export INFISICAL_CLIENT_SECRET="$CLIENT_SECRET"
    fi
    echo "[Entrypoint] Injecting secrets from Infisical ($API_DOMAIN, project: $PROJECT_ID, env: $ENV_TARGET)..."
    exec infisical run --domain="$API_DOMAIN" --env="$ENV_TARGET" $PROJECT_ARG --path=/ -- ptsp-wa-bot "$@"
else
    exec ptsp-wa-bot "$@"
fi
