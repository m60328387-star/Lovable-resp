#!/bin/bash
# استرجاع قاعدة بيانات Weaver من نسخة احتياطية على الخادم.
# الاستخدام (على الخادم):
#   bash /opt/weaver/deploy/db/restore.sh                # آخر نسخة
#   bash /opt/weaver/deploy/db/restore.sh weaver-2026...-.sql.gz
set -euo pipefail

ROOT="${WEAVER_ROOT:-/opt/weaver}"
BACKUP_DIR="${WEAVER_BACKUP_DIR:-$ROOT/backups}"
FILE="${1:-latest.sql.gz}"
SRC="$BACKUP_DIR/$FILE"

[ -f "$SRC" ] || { echo "النسخة غير موجودة: $SRC"; ls -1 "$BACKUP_DIR" 2>/dev/null | tail -20; exit 1; }
gzip -t "$SRC" || { echo "ملف النسخة تالف: $SRC"; exit 1; }

cd "$ROOT/deploy"

echo "== نسخة أمان قبل الاسترجاع =="
docker compose exec -T db pg_dump -U weaver -d weaver --clean --if-exists \
  | gzip -9 > "$BACKUP_DIR/pre-restore-$(date -u +%Y%m%d-%H%M%S).sql.gz"

echo "== إيقاف التطبيق والعامل =="
docker compose stop app worker >/dev/null 2>&1 || true

echo "== الاسترجاع من $SRC =="
gunzip -c "$SRC" | docker compose exec -T db psql -U weaver -d weaver -v ON_ERROR_STOP=1

echo "== إعادة التشغيل =="
docker compose start app worker

echo "تم الاسترجاع بنجاح."
