#!/bin/sh
# نسخ احتياطي دوري لقاعدة بيانات Weaver على كونتابو.
# يعمل داخل حاوية postgres:17-alpine ويكتب إلى /backups (مجلد مثبّت على قرص الخادم).
set -eu

DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
DB_USER="${POSTGRES_USER:-weaver}"
DB_NAME="${POSTGRES_DB:-weaver}"
DB_HOST="${BACKUP_DB_HOST:-db}"

mkdir -p "$DIR"

run_backup() {
  ts="$(date -u +%Y%m%d-%H%M%S)"
  tmp="$DIR/.weaver-$ts.sql.gz.part"
  out="$DIR/weaver-$ts.sql.gz"

  if pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" --clean --if-exists | gzip -9 > "$tmp"; then
    mv "$tmp" "$out"
    # لا نقبل نسخة فارغة/تالفة
    if ! gzip -t "$out" 2>/dev/null || [ ! -s "$out" ]; then
      echo "[backup] فشل التحقق من $out — حذفها"
      rm -f "$out"
      return 1
    fi
    ln -sf "$(basename "$out")" "$DIR/latest.sql.gz"
    date -u +%Y-%m-%dT%H:%M:%SZ > "$DIR/last-success.txt"
    echo "[backup] تم: $out ($(wc -c < "$out") بايت)"
  else
    echo "[backup] فشل pg_dump"
    rm -f "$tmp"
    return 1
  fi

  # الاحتفاظ بآخر KEEP_DAYS يوماً فقط
  find "$DIR" -maxdepth 1 -name 'weaver-*.sql.gz' -mtime "+$KEEP_DAYS" -delete 2>/dev/null || true
}

echo "[backup] بدء خدمة النسخ الاحتياطي (كل ${INTERVAL}s، الاحتفاظ ${KEEP_DAYS} يوماً)"
while true; do
  run_backup || echo "[backup] سيُعاد المحاولة في الدورة التالية"
  sleep "$INTERVAL"
done
