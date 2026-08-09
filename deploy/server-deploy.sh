#!/bin/bash
# نشر Weaver من داخل الخادم نفسه (يُستدعى من خطّاف النشر deploy-hook.mjs).
# يسحب آخر كود من GitHub، يحتفظ بنسخة احتياطية للتراجع، ثم يعيد بناء الحاويات ويتحقق من الصحة.
set -e

ROOT="${WEAVER_ROOT:-/opt/weaver}"
ENV_FILE="$ROOT/deploy/.env"
BACKUP="${WEAVER_BACKUP:-/opt/weaver-prev}"
PORT="${WEAVER_HTTP_PORT:-8081}"
RELEASE_FILE=".weaver-release"

if [ ! -f "$ENV_FILE" ]; then
  echo "ملف الإعدادات $ENV_FILE غير موجود"
  exit 1
fi

read_env() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- || true; }

REPO_URL="$(read_env GITHUB_REPO_URL)"
TOKEN="$(read_env GITHUB_TOKEN)"
REF="${1:-}"

if [ -z "$REPO_URL" ] || [ -z "$TOKEN" ]; then
  echo "GITHUB_REPO_URL و GITHUB_TOKEN مطلوبان في deploy/.env للنشر الذاتي"
  exit 1
fi

SLUG="$(printf '%s' "$REPO_URL" | sed -E 's#(https?://)?(www\.)?github\.com/##; s#\.git$##; s#/+$##')"
BRANCH="${REF:-$(curl -sf -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/$SLUG" | grep -o '"default_branch": *"[^"]*"' | head -1 | cut -d'"' -f4)}"
BRANCH="${BRANCH:-main}"

echo "== سحب $SLUG@$BRANCH =="
TMP="$(mktemp -d)"
curl -fsSL -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/$SLUG/tarball/$BRANCH" -o "$TMP/src.tar.gz"
mkdir -p "$TMP/src"
tar xzf "$TMP/src.tar.gz" -C "$TMP/src" --strip-components=1

if [ ! -f "$TMP/src/package.json" ]; then
  echo "الأرشيف المسحوب غير صالح (لا يوجد package.json)"
  rm -rf "$TMP"
  exit 1
fi

# Never let an old/incomplete repository snapshot erase a newer Weaver install.
# قراءة علامة الإصدار: يُفضَّل .weaver-release، وإلا الحقل weaverRelease في package.json
# (بعض أدوات المزامنة لا ترفع ملفات النقطة في الجذر، فيبقى package.json مصدراً موثوقاً).
read_release() {
  local dir="$1"
  if [ -f "$dir/$RELEASE_FILE" ]; then
    tr -d '\r\n' < "$dir/$RELEASE_FILE"
    return
  fi
  if [ -f "$dir/package.json" ]; then
    grep -m1 '"weaverRelease"' "$dir/package.json" 2>/dev/null | sed -E 's/.*"weaverRelease" *: *"([^"]*)".*/\1/'
  fi
}

INSTALLED_RELEASE="$(read_release "$ROOT")"
CANDIDATE_RELEASE="$(read_release "$TMP/src")"
if [ -n "$INSTALLED_RELEASE" ]; then
  # يُقبل النشر فقط إذا كانت نسخة GitHub مطابقة للنسخة المثبّتة أو أحدث منها.
  NEWEST="$(printf '%s\n%s\n' "$INSTALLED_RELEASE" "$CANDIDATE_RELEASE" | sort -V | tail -1)"
  if [ -z "$CANDIDATE_RELEASE" ] || { [ "$CANDIDATE_RELEASE" != "$INSTALLED_RELEASE" ] && [ "$NEWEST" != "$CANDIDATE_RELEASE" ]; }; then
    echo "رفض النشر: نسخة GitHub أقدم أو غير متزامنة (installed=$INSTALLED_RELEASE, candidate=${CANDIDATE_RELEASE:-missing})."
    echo "زامن مستودع Weaver أولاً؛ لم يتم تغيير النسخة العاملة."
    rm -rf "$TMP"
    exit 1
  fi
fi

# تثبيت علامة الإصدار الجديدة بصيغة الملف حتى لو جاءت من package.json فقط.
if [ -n "$CANDIDATE_RELEASE" ]; then
  printf '%s\n' "$CANDIDATE_RELEASE" > "$TMP/src/$RELEASE_FILE"
fi

echo "== نسخة احتياطية للتراجع =="
rm -rf "$BACKUP"
mkdir -p "$BACKUP"
tar cf - -C "$ROOT" --exclude=node_modules --exclude=.output --exclude=dist . | tar xf - -C "$BACKUP"

echo "== تحديث الكود =="
rm -rf "$ROOT/src" "$ROOT/public"
cp -a "$TMP/src/." "$ROOT/"
# لا نسمح للكود المسحوب بأن يمسح أسرار الخادم
cp -a "$BACKUP/deploy/.env" "$ENV_FILE"
rm -rf "$TMP"

echo "== إعادة البناء =="
cd "$ROOT/deploy"
docker compose up -d --build

for i in $(seq 1 30); do docker compose exec -T db pg_isready -U weaver >/dev/null 2>&1 && break; sleep 2; done
for f in db/init/03-agent-jobs.sql db/init/04-audit-connectors.sql; do
  [ -f "$f" ] && docker compose exec -T db psql -U weaver -d weaver < "$f" >/dev/null 2>&1 || true
done

echo "== التحقق =="
body=""
for i in $(seq 1 40); do
  body=$(curl -sf "http://127.0.0.1:$PORT/api/public/health" || true)
  case "$body" in *'"ok":true'*) break;; esac
  sleep 5
done
echo "HEALTH: ${body:-<no response>}"

# بيئة التنفيذ (حاوية runtime) — تحذير فقط، لا يُفشل النشر.
rt=""
for i in $(seq 1 20); do
  rt=$(docker compose exec -T runtime node -e "fetch('http://127.0.0.1:4100/health').then(r=>r.text()).then(t=>console.log(t)).catch(()=>process.exit(1))" 2>/dev/null || true)
  case "$rt" in *'"ok":true'*) break;; esac
  sleep 3
done
echo "RUNTIME: ${rt:-<not ready>}"

case "${body:-}" in
  *'"ok":true'*) echo "DEPLOY: PASS";;
  *) echo "DEPLOY: FAIL"; exit 1;;
esac
