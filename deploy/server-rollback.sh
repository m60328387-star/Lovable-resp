#!/bin/bash
# التراجع عن آخر نشر ذاتي: يعيد النسخة المحفوظة في /opt/weaver-prev ثم يعيد البناء.
set -e

ROOT="${WEAVER_ROOT:-/opt/weaver}"
BACKUP="${WEAVER_BACKUP:-/opt/weaver-prev}"
PORT="${WEAVER_HTTP_PORT:-8081}"

if [ ! -d "$BACKUP/src" ]; then
  echo "لا توجد نسخة سابقة للتراجع إليها ($BACKUP)"
  exit 1
fi

echo "== استعادة النسخة السابقة =="
CURRENT_ENV="$(mktemp)"
cp -a "$ROOT/deploy/.env" "$CURRENT_ENV" 2>/dev/null || true
rm -rf "$ROOT/src" "$ROOT/public"
cp -a "$BACKUP/." "$ROOT/"
[ -s "$CURRENT_ENV" ] && cp -a "$CURRENT_ENV" "$ROOT/deploy/.env"
rm -f "$CURRENT_ENV"

cd "$ROOT/deploy"
docker compose up -d --build

body=""
for i in $(seq 1 40); do
  body=$(curl -sf "http://127.0.0.1:$PORT/api/public/health" || true)
  case "$body" in *'"ok":true'*) break;; esac
  sleep 5
done
echo "HEALTH: ${body:-<no response>}"
case "${body:-}" in
  *'"ok":true'*) echo "ROLLBACK: PASS";;
  *) echo "ROLLBACK: FAIL"; exit 1;;
esac
