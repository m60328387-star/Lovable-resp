#!/bin/bash
# نشر Weaver من داخل الخادم نفسه (يُستدعى من خطّاف النشر deploy-hook.mjs).
# يسحب آخر كود من GitHub، يحتفظ بنسخة احتياطية للتراجع، ثم يعيد بناء الحاويات ويتحقق من الصحة.
set -e

# السكربت يستبدل ملفات المشروع (ومنها هذا الملف نفسه) أثناء التنفيذ،
# وbash يقرأ الملف تدريجياً فيتعطّل. لذلك ننسخه إلى /tmp ونعيد تشغيله من هناك.
if [ -z "${WEAVER_SELF_COPY:-}" ]; then
  SELF_COPY="$(mktemp /tmp/weaver-deploy-XXXXXX.sh)"
  cat "$0" > "$SELF_COPY"
  chmod +x "$SELF_COPY"
  WEAVER_SELF_COPY=1 exec bash "$SELF_COPY" "$@"
fi

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

# Runtime أساسي للمعاينة والبناء. ولّد سراً فعلياً عند غيابه أو بقاء قيمة المثال.
EXECUTOR_TOKEN_VALUE="$(read_env EXECUTOR_TOKEN)"
if [ ${#EXECUTOR_TOKEN_VALUE} -lt 16 ] || [ "$EXECUTOR_TOKEN_VALUE" = "replace-with-executor-token-from-app" ]; then
  GENERATED_EXECUTOR_TOKEN="$(openssl rand -hex 32)"
  if grep -q '^EXECUTOR_TOKEN=' "$ENV_FILE"; then
    sed -i "s/^EXECUTOR_TOKEN=.*/EXECUTOR_TOKEN=$GENERATED_EXECUTOR_TOKEN/" "$ENV_FILE"
  else
    printf '\nEXECUTOR_TOKEN=%s\n' "$GENERATED_EXECUTOR_TOKEN" >> "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
  unset GENERATED_EXECUTOR_TOKEN
fi

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

BACKUP_DIR="${WEAVER_BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "== نسخة احتياطية لقاعدة البيانات قبل النشر =="
if [ -d "$ROOT/deploy" ]; then
  (cd "$ROOT/deploy" && docker compose exec -T db pg_dump -U weaver -d weaver --clean --if-exists \
    | gzip -9 > "$BACKUP_DIR/pre-deploy-$(date -u +%Y%m%d-%H%M%S).sql.gz") \
    && echo "DB_BACKUP: ok" || echo "DB_BACKUP: skipped (قاعدة البيانات غير متاحة)"
fi

echo "== نسخة احتياطية للتراجع =="
rm -rf "$BACKUP"
mkdir -p "$BACKUP"
tar cf - -C "$ROOT" --exclude=node_modules --exclude=.output --exclude=dist --exclude=backups . | tar xf - -C "$BACKUP"

echo "== تحديث الكود =="
# استبدال نظيف: قد يحتوي الإصدار الحالي على ملفات جذرية تخص موقع عميل
# (index.html/styles.css/...) نتيجة رفع خاطئ سابق. إبقاؤها يجعل Vite يبني
# موقع العميل بدلاً من Weaver حتى لو كانت src الجديدة صحيحة.
SAVED_ENV="$(mktemp)"
cp "$BACKUP/deploy/.env" "$SAVED_ENV"
# احذف فقط عناصر الجذر الدخيلة التي لا وجود لها في نسخة Weaver الجديدة.
# لا تحذف مجلد deploy الجاري تنفيذه ولا مجلد النسخ الاحتياطية.
for current in "$ROOT"/* "$ROOT"/.[!.]* "$ROOT"/..?*; do
  [ -e "$current" ] || continue
  name="$(basename "$current")"
  [ "$name" = "backups" ] && continue
  [ -e "$TMP/src/$name" ] || rm -rf "$current"
done
cp -a "$TMP/src/." "$ROOT/"
# لا نسمح للكود المسحوب بأن يمسح أسرار الخادم
mkdir -p "$(dirname "$ENV_FILE")"
cp "$SAVED_ENV" "$ENV_FILE"
chmod 600 "$ENV_FILE"
rm -f "$SAVED_ENV"
rm -rf "$TMP"
chmod +x "$ROOT/deploy/db/backup.sh" "$ROOT/deploy/db/restore.sh" 2>/dev/null || true

echo "== إعادة البناء =="
cd "$ROOT/deploy"
# مهلة قصوى: لا نترك النشر معلّقاً للأبد إذا تأخّرت إحدى الحاويات.
build_rc=0
timeout 1500 docker compose up -d --build || build_rc=$?
if [ "$build_rc" -ne 0 ]; then
  echo "BUILD: FAIL (rc=$build_rc)"
  echo "== تراجع تلقائي إلى الإصدار السابق =="
  docker compose up -d 2>&1 | tail -5 || true
  echo "DEPLOY: FAIL"
  exit 1
fi
echo "BUILD: OK"

for i in $(seq 1 30); do docker compose exec -T db pg_isready -U weaver >/dev/null 2>&1 && break; sleep 2; done
for f in $(ls db/init/*.sql 2>/dev/null | sort); do
  docker compose exec -T db psql -U weaver -d weaver < "$f" >/dev/null 2>&1 || echo "MIGRATION SKIPPED: $f"
done

WEAVER_WORKER_TOKEN="${WEAVER_WORKER_TOKEN:-$(grep -m1 "^WEAVER_WORKER_TOKEN=" .env 2>/dev/null | cut -d= -f2-)}"
echo "== التحقق =="
body=""
for i in $(seq 1 40); do
  body=$(curl -sf -H "Authorization: Bearer ${WEAVER_WORKER_TOKEN:-}" "http://127.0.0.1:$PORT/api/public/health" || true)
  case "$body" in *'"ok":true'*) break;; esac
  sleep 5
done
echo "HEALTH: ${body:-<no response>}"

# بيئة التنفيذ جزء أساسي من البناء والمعاينة؛ فشلها يفشل الإصدار بدل نشر نسخة ناقصة.
rt=""
for i in $(seq 1 20); do
  rt=$(docker compose exec -T runtime node -e "fetch('http://127.0.0.1:4100/health').then(r=>r.text()).then(t=>console.log(t)).catch(()=>process.exit(1))" 2>/dev/null || true)
  case "$rt" in *'"ok":true'*) break;; esac
  sleep 3
done
echo "RUNTIME: ${rt:-<not ready>}"

case "${rt:-}" in
  *'"ok":true'*) ;;
  *)
    echo "DEPLOY: FAIL (runtime unavailable)"
    docker compose logs --tail=80 runtime 2>&1 | sed -E 's/(token|secret|password|key)=?[^ ]*/\1=[REDACTED]/Ig' || true
    exit 1
    ;;
esac

case "${body:-}" in
  *'"ok":true'*) echo "DEPLOY: PASS";;
  *) echo "DEPLOY: FAIL"; exit 1;;
esac
