#!/usr/bin/env bash
# Nightly logical backup of the Cholo database.
#
#   cron (on the server, as the deploy user):
#     15 3 * * * cd /opt/cholo && ./ops/backup/pg-backup.sh >> /var/log/cholo-backup.log 2>&1
#
# Writes backups/cholo-YYYYmmdd-HHMMSS.dump (pg_dump custom format, compressed),
# uploads it to object storage when BACKUP_S3_URI is set (aws cli; any S3-compatible
# endpoint via BACKUP_S3_ENDPOINT, e.g. Cloudflare R2 / Backblaze B2 / MinIO),
# and keeps BACKUP_KEEP_DAYS days locally.
set -euo pipefail

cd "$(dirname "$0")/../.."
[ -f .env ] && set -a && . ./.env && set +a

: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="${DIR}/cholo-${STAMP}.dump"
mkdir -p "$DIR"

echo "[$(date -u +%FT%TZ)] dumping ${POSTGRES_DB} → ${FILE}"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom --compress=9 --no-owner --no-privileges --lock-wait-timeout=60s > "${FILE}.partial"
mv "${FILE}.partial" "$FILE"

# sanity check: the archive must list its table of contents
docker compose exec -T postgres pg_restore --list < "$FILE" > /dev/null
sha256sum "$FILE" > "${FILE}.sha256"
echo "  size $(du -h "$FILE" | cut -f1)"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  ENDPOINT_ARGS=()
  [ -n "${BACKUP_S3_ENDPOINT:-}" ] && ENDPOINT_ARGS=(--endpoint-url "$BACKUP_S3_ENDPOINT")
  aws "${ENDPOINT_ARGS[@]}" s3 cp "$FILE" "${BACKUP_S3_URI%/}/$(basename "$FILE")" --only-show-errors
  aws "${ENDPOINT_ARGS[@]}" s3 cp "${FILE}.sha256" "${BACKUP_S3_URI%/}/$(basename "$FILE").sha256" --only-show-errors
  echo "  uploaded to ${BACKUP_S3_URI}"
fi

find "$DIR" -name 'cholo-*.dump*' -mtime "+${KEEP_DAYS}" -delete
echo "[$(date -u +%FT%TZ)] backup ok"
