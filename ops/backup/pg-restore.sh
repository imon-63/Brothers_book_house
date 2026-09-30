#!/usr/bin/env bash
# Restore a pg_dump archive into a database (default: a scratch DB for the monthly drill).
#
#   ./ops/backup/pg-restore.sh backups/cholo-20260101-031500.dump            # → cholo_restore_check
#   TARGET_DB=cholo ./ops/backup/pg-restore.sh <file>  # DANGER: real restore (stop api first)
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] && set -a && . ./.env && set +a

FILE="${1:?usage: pg-restore.sh <dump-file>}"
TARGET="${TARGET_DB:-cholo_restore_check}"
: "${POSTGRES_USER:?}"

if [ "$TARGET" = "${POSTGRES_DB:-cholo}" ]; then
  read -r -p "Restore INTO THE LIVE DATABASE '$TARGET'? type the db name to continue: " ok
  [ "$ok" = "$TARGET" ] || { echo "aborted"; exit 1; }
fi

[ -f "${FILE}.sha256" ] && sha256sum -c "${FILE}.sha256"

docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"${TARGET}\" WITH (FORCE);" -c "CREATE DATABASE \"${TARGET}\";"
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$TARGET" --no-owner --no-privileges --exit-on-error < "$FILE"

echo "Restored into ${TARGET}. Spot checks:"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$TARGET" -At -c \
  "SELECT 'orders', count(*) FROM orders UNION ALL SELECT 'products', count(*) FROM products UNION ALL SELECT 'last order', coalesce(max(placed_at)::text,'-') FROM orders UNION ALL SELECT 'migrations', count(*) FROM _prisma_migrations;"
