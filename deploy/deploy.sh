#!/bin/sh
set -eu

IMAGE=${1:?Usage: deploy.sh IMAGE [COMPOSE_FILE]}
SERVICE_VERSION=${SERVICE_VERSION:-${IMAGE##*:}}
COMPOSE_FILE=${2:-compose.yml}
SERVICE=account-service
CONTAINER=chat-web-account-service
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
PULL_ATTEMPTS=${PULL_ATTEMPTS:-8}
deployment_started=0

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Compose file not found: $COMPOSE_FILE" >&2
    exit 1
fi

if [ ! -f .env ]; then
    echo "Missing $(pwd)/.env; create it from deploy/.env.example before the first deployment." >&2
    exit 1
fi

# 清理历史 OpenTelemetry 环境，避免旧配置覆盖 Nacos 远端配置。
temporary_env=$(mktemp .env.XXXXXX)
awk '
    /^OTEL_/ { next }
    /^NODE_OPTIONS=.*@opentelemetry\/auto-instrumentations-node\/register/ { next }
    { print }
' .env > "$temporary_env"
chmod 600 "$temporary_env"
mv "$temporary_env" .env

old_image=$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)

compose() {
    IMAGE="$IMAGE" SERVICE_VERSION="$SERVICE_VERSION" docker compose -f "$COMPOSE_FILE" "$@"
}

rollback() {
    echo "Deployment failed; showing the latest container logs." >&2
    docker logs --tail 100 "$CONTAINER" 2>&1 || true

    if [ -n "$old_image" ] && [ "$old_image" != "$IMAGE" ]; then
        echo "Rolling back to $old_image" >&2
        IMAGE="$old_image" SERVICE_VERSION="${old_image##*:}" docker compose -f "$COMPOSE_FILE" up -d --no-deps "$SERVICE"
    else
        echo "No previous image is available for rollback." >&2
    fi
}

trap 'deployment_started=0; rollback; exit 130' HUP INT TERM

attempt=1
while ! docker pull "$IMAGE"; do
    if [ "$attempt" -ge "$PULL_ATTEMPTS" ]; then
        echo "Failed to pull $IMAGE after $PULL_ATTEMPTS attempts." >&2
        exit 1
    fi
    sleep $((attempt * 5))
    attempt=$((attempt + 1))
done

network=$(sed -n 's/^DOCKER_NETWORK=//p' .env | tail -n 1 | tr -d '\r')
network=${network:-chat-web-infrastructure}
case "$network" in
    *[!A-Za-z0-9_.-]*|'')
        echo "Invalid DOCKER_NETWORK in .env" >&2
        exit 1
        ;;
esac
docker network inspect "$network" >/dev/null 2>&1 || {
    echo "Required Docker network is unavailable: $network" >&2
    exit 1
}

echo "Applying account database schema migrations"
docker run --rm \
    --network "$network" \
    --env-file .env \
    --entrypoint node \
    "$IMAGE" dist/cli/isolate-service-databases.js
docker run --rm \
    --network "$network" \
    --env-file .env \
    --entrypoint node \
    "$IMAGE" dist/cli/apply-schema.js

echo "Starting $SERVICE"
deployment_started=1
if ! compose up -d --no-deps "$SERVICE"; then
    rollback
    exit 1
fi

elapsed=0
while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER" 2>/dev/null || true)
    case "$state" in
        healthy)
            echo "Deployment succeeded: $IMAGE"
            trap - HUP INT TERM
            docker image prune -f >/dev/null 2>&1 || true
            exit 0
            ;;
        exited|dead|unhealthy)
            echo "Container state: $state" >&2
            rollback
            exit 1
            ;;
    esac
    sleep 5
    elapsed=$((elapsed + 5))
done

echo "Health check timed out after ${HEALTH_TIMEOUT}s." >&2
rollback
exit 1
