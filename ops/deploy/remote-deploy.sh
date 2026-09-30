#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
#  Runs ON THE SERVER (invoked by .github/workflows/deploy.yml over SSH):
#
#    ./ops/deploy/remote-deploy.sh <new-image-tag>
#
#  1. pull the new api/web images
#  2. run the one-shot `migrate` service (prisma migrate deploy)
#  3. docker compose up -d --remove-orphans
#  4. wait for api /health/ready, web and nginx to be healthy
#  5. on failure → roll back api/web to the previous tag and exit 1
#  6. prune images older than 10 days (the previous tag stays for rollbacks)
#
#  Migrations are forward-only; a rollback re-runs the OLD code against the
#  NEW schema, which is why migrations must be backwards compatible
#  (expand → deploy → contract; see backend/docs/deployment.md).
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail

NEW_TAG="${1:?usage: remote-deploy.sh <image-tag>}"
cd "$(dirname "$0")/../.."
STATE_DIR=.deploy
mkdir -p "$STATE_DIR"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

set_tag() {
  if grep -q '^IMAGE_TAG=' .env; then
    sed -i.bak "s|^IMAGE_TAG=.*|IMAGE_TAG=$1|" .env && rm -f .env.bak
  else
    echo "IMAGE_TAG=$1" >> .env
  fi
}

wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  log "waiting up to ${HEALTH_TIMEOUT}s for api / web / nginx…"
  while (( SECONDS < deadline )); do
    local ok=1
    docker compose exec -T api wget -qO- http://127.0.0.1:4000/api/v1/health/ready >/dev/null 2>&1 || ok=0
    docker compose exec -T web wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || ok=0
    docker compose exec -T nginx wget -qO- http://127.0.0.1/api/v1/health/live >/dev/null 2>&1 || ok=0
    if (( ok == 1 )); then log "healthy"; return 0; fi
    sleep 5
  done
  return 1
}

PREV_TAG="$(cat "$STATE_DIR/current_tag" 2>/dev/null || true)"
log "deploying ${NEW_TAG} (previous: ${PREV_TAG:-none})"

set_tag "$NEW_TAG"
docker compose pull --quiet api web migrate
docker compose pull --quiet --ignore-pull-failures postgres nginx otel-collector tempo prometheus grafana || true

log "running migrations"
if ! docker compose run --rm migrate; then
  log "migration FAILED — keeping ${PREV_TAG:-current} containers running"
  [ -n "$PREV_TAG" ] && set_tag "$PREV_TAG"
  exit 1
fi

log "starting services"
docker compose up -d --remove-orphans

if wait_healthy; then
  echo "$NEW_TAG" > "$STATE_DIR/current_tag"
  echo "$(date -u +%FT%TZ) ${NEW_TAG}" >> "$STATE_DIR/history"
  log "pruning old images"
  docker image prune -af --filter "until=240h" >/dev/null || true
  log "deploy of ${NEW_TAG} complete"
  exit 0
fi

log "health checks FAILED for ${NEW_TAG}"
docker compose ps
docker compose logs --tail=80 api web || true

if [ -n "$PREV_TAG" ]; then
  log "rolling back to ${PREV_TAG}"
  set_tag "$PREV_TAG"
  docker compose up -d --remove-orphans api web nginx
  if wait_healthy; then
    log "rollback to ${PREV_TAG} healthy"
  else
    log "ROLLBACK ALSO UNHEALTHY — manual intervention needed"
  fi
  echo "$(date -u +%FT%TZ) ${NEW_TAG} FAILED → rolled back to ${PREV_TAG}" >> "$STATE_DIR/history"
fi
exit 1
