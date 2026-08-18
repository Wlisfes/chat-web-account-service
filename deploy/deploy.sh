#!/bin/sh
set -eu

IMAGE=${1:?Usage: deploy.sh IMAGE [COMPOSE_FILE]}
COMPOSE_FILE=${2:-compose.yml}
SERVICE=account-service
CONTAINER=chat-web-account-service
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
PULL_ATTEMPTS=${PULL_ATTEMPTS:-3}
REDIS_CONTAINER=${REDIS_CONTAINER:-chat-web-redis}
deployment_started=0
redis_target_pinned=0

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "Compose file not found: $COMPOSE_FILE" >&2
    exit 1
fi

if [ ! -f .env ]; then
    echo "Missing $(pwd)/.env; create it from deploy/.env.example before the first deployment." >&2
    exit 1
fi

old_image=$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)

compose() {
    IMAGE="$IMAGE" docker compose -f "$COMPOSE_FILE" "$@"
}

read_env_value() {
    key=$1
    sed -n "s/^${key}=//p" .env | tail -n 1 | tr -d '\r'
}

write_env_value() {
    key=$1
    value=$2
    temporary_env=$(mktemp .env.XXXXXX)
    if ! ENV_VALUE="$value" awk -v key="$key" '
        BEGIN { replaced = 0 }
        $0 ~ "^" key "=" {
            if (!replaced) {
                print key "=" ENVIRON["ENV_VALUE"]
                replaced = 1
            }
            next
        }
        { print }
        END {
            if (!replaced) print key "=" ENVIRON["ENV_VALUE"]
        }
    ' .env > "$temporary_env"; then
        rm -f "$temporary_env"
        return 1
    fi
    chmod 600 "$temporary_env"
    mv "$temporary_env" .env
}

pin_local_redis_target() {
    redis_direct_host=$1
    write_env_value REDIS_HOST "$redis_direct_host"
    write_env_value REDIS_URL ""
    export REDIS_HOST="$redis_direct_host"
    export REDIS_URL=
    redis_target_pinned=1
}

verify_pinned_redis_environment() {
    if [ "$redis_target_pinned" -ne 1 ]; then
        return
    fi

    expected_host=$(read_env_value REDIS_HOST)
    expected_password=$(read_env_value REDIS_PASSWORD)
    actual_environment=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER")
    actual_host=$(printf '%s\n' "$actual_environment" | sed -n 's/^REDIS_HOST=//p' | tail -n 1)
    actual_url=$(printf '%s\n' "$actual_environment" | sed -n 's/^REDIS_URL=//p' | tail -n 1)
    actual_password=$(printf '%s\n' "$actual_environment" | sed -n 's/^REDIS_PASSWORD=//p' | tail -n 1)
    unset actual_environment

    if [ "$actual_host" != "$expected_host" ] ||
        [ -n "$actual_url" ] ||
        [ "$actual_password" != "$expected_password" ]; then
        echo "The new Account container did not receive the pinned Redis environment." >&2
        return 1
    fi

    echo "Verified the pinned Redis environment on the new Account container."
}

resolve_local_redis_password() {
    redis_url=$(read_env_value REDIS_URL)
    redis_password=$(read_env_value REDIS_PASSWORD)
    redis_host=$(read_env_value REDIS_HOST)
    redis_port=$(read_env_value REDIS_PORT)
    redis_port=${redis_port:-6379}

    if [ -n "$redis_password" ]; then
        echo "Redis deployment configuration contains an explicit password."
        return
    fi

    if [ -n "$redis_url" ]; then
        redis_authority=${redis_url#*://}
        if [ "$redis_authority" = "$redis_url" ]; then
            return
        fi
        redis_authority=${redis_authority%%/*}
        case "$redis_authority" in
            *@*)
                redis_user_info=${redis_authority%%@*}
                redis_authority=${redis_authority#*@}
                case "$redis_user_info" in
                    *:*)
                        redis_url_password=${redis_user_info#*:}
                        if [ -n "$redis_url_password" ]; then
                            echo "Redis deployment URL already contains authentication information."
                            return
                        fi
                        ;;
                esac
                ;;
        esac
        case "$redis_authority" in
            *:*)
                redis_port=${redis_authority##*:}
                redis_authority=${redis_authority%:*}
                ;;
        esac
        redis_host=${redis_authority%%:*}
    fi
    redis_host=${redis_host:-$REDIS_CONTAINER}

    local_redis_container=
    if docker inspect "$redis_host" >/dev/null 2>&1; then
        local_redis_container=$redis_host
    elif docker inspect "$REDIS_CONTAINER" >/dev/null 2>&1; then
        container_aliases=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{range .Aliases}}{{println .}}{{end}}{{end}}' "$REDIS_CONTAINER")
        container_ip=$(docker inspect --format "{{with index .NetworkSettings.Networks \"$network\"}}{{.IPAddress}}{{end}}" "$REDIS_CONTAINER")
        if printf '%s\n' "$container_aliases" | grep -Fx -- "$redis_host" >/dev/null 2>&1 ||
            printf '%s\n' "$redis_host" | grep -Eq '^[0-9a-f]{12}$' ||
            [ "$redis_host" = "$container_ip" ]; then
            local_redis_container=$REDIS_CONTAINER
        fi
        unset container_aliases
        unset container_ip
    fi

    if [ -z "$local_redis_container" ]; then
        echo "Redis deployment target does not match a local container; keeping the explicit configuration."
        return
    fi

    redis_direct_host=$(docker inspect --format "{{with index .NetworkSettings.Networks \"$network\"}}{{.IPAddress}}{{end}}" "$local_redis_container")
    if ! printf '%s\n' "$redis_direct_host" | grep -Eq '^[0-9]+(\.[0-9]+){3}$'; then
        echo "The validated local Redis container has no usable IPv4 address on the deployment network." >&2
        return 1
    fi
    redis_client_image=$(docker inspect --format '{{.Config.Image}}' "$local_redis_container")
    redis_ping_output=$(docker run --rm \
        --network "$network" \
        --entrypoint redis-cli \
        "$redis_client_image" \
        -h "$redis_direct_host" \
        -p "$redis_port" \
        -3 \
        ping 2>/dev/null || true)
    redis_ping_output=$(printf '%s' "$redis_ping_output" | tr -d '\r\n')
    if [ "$redis_ping_output" = "PONG" ]; then
        unset redis_ping_output
        pin_local_redis_target "$redis_direct_host"
        echo "Pinned Account to the validated local Redis container in the protected deployment .env; anonymous RESP3 PING succeeded."
        return
    fi
    unset redis_ping_output

    echo "Redis deployment target requires authentication; resolving a local credential source."

    container_environment=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$local_redis_container")
    for key in REDIS_PASSWORD REDIS_PASS REDISCLI_AUTH; do
        redis_password=$(printf '%s\n' "$container_environment" | sed -n "s/^${key}=//p" | tail -n 1)
        if [ -n "$redis_password" ]; then
            credential_source="container environment key $key"
            break
        fi
    done
    unset container_environment

    if [ -z "$redis_password" ]; then
        container_command=$(docker inspect --format '{{range .Config.Cmd}}{{println .}}{{end}}' "$local_redis_container")
        redis_password=$(printf '%s\n' "$container_command" | awk 'previous == "--requirepass" { print; exit } { previous = $0 }')
        unset container_command
        if [ -n "$redis_password" ]; then
            credential_source="separate --requirepass container argument"
        fi
    fi

    if [ -z "$redis_password" ]; then
        echo "Redis requires authentication, but no explicit Account credential or supported local container credential source was found." >&2
        echo "Set authenticated REDIS_URL/REDIS_PASSWORD in the deployment .env, or expose REDIS_PASSWORD, REDIS_PASS, REDISCLI_AUTH, or a separate --requirepass argument on $local_redis_container." >&2
        return 1
    fi

    redis_ping_output=$(docker run --rm \
        --network "$network" \
        -e REDISCLI_AUTH="$redis_password" \
        --entrypoint redis-cli \
        "$redis_client_image" \
        -h "$redis_direct_host" \
        -p "$redis_port" \
        -3 \
        ping 2>/dev/null || true)
    redis_ping_output=$(printf '%s' "$redis_ping_output" | tr -d '\r\n')
    if [ "$redis_ping_output" != "PONG" ]; then
        unset redis_ping_output
        unset redis_password
        echo "The Redis credential discovered from $credential_source failed validation." >&2
        return 1
    fi
    unset redis_ping_output

    write_env_value REDIS_PASSWORD "$redis_password"
    export REDIS_PASSWORD="$redis_password"
    pin_local_redis_target "$redis_direct_host"
    unset redis_password
    echo "Pinned Account to the authenticated local Redis container in the protected deployment .env using the validated credential from $credential_source."
}

rollback() {
    echo "Deployment failed; showing the latest container logs." >&2
    docker logs --tail 100 "$CONTAINER" 2>&1 || true

    if [ -n "$old_image" ] && [ "$old_image" != "$IMAGE" ]; then
        echo "Rolling back to $old_image" >&2
        IMAGE="$old_image" docker compose -f "$COMPOSE_FILE" up -d --no-deps "$SERVICE"
    else
        echo "No previous image is available for rollback." >&2
    fi
}

# shellcheck disable=SC2329 # Invoked indirectly by trap.
handle_interrupt() {
    trap - HUP INT TERM
    echo "Deployment interrupted by a newer version." >&2

    if [ "$deployment_started" -eq 1 ]; then
        rollback
    fi

    exit 130
}

trap handle_interrupt HUP INT TERM

pull_image() {
    attempt=1
    while ! docker pull "$IMAGE"; do
        if [ "$attempt" -ge "$PULL_ATTEMPTS" ]; then
            echo "Failed to pull $IMAGE after $PULL_ATTEMPTS attempts." >&2
            return 1
        fi

        delay=$((attempt * 5))
        echo "Image pull attempt $attempt failed; retrying in ${delay}s." >&2
        sleep "$delay"
        attempt=$((attempt + 1))
    done
}

echo "Pulling $IMAGE (up to $PULL_ATTEMPTS attempts)"
pull_image

network=$(sed -n 's/^DOCKER_NETWORK=//p' .env | tail -n 1)
network=${network:-chat-web-infrastructure}
case "$network" in
    *[!A-Za-z0-9_.-]*|'')
        echo "Invalid DOCKER_NETWORK in .env" >&2
        exit 1
        ;;
esac

echo "Applying account database schema migrations"
docker run --rm \
    --network "$network" \
    --env-file .env \
    --entrypoint node \
    "$IMAGE" dist/cli/apply-schema.js

resolve_local_redis_password

echo "Starting $SERVICE"
deployment_started=1
if ! compose up -d --no-deps "$SERVICE"; then
    rollback
    exit 1
fi
if ! verify_pinned_redis_environment; then
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
