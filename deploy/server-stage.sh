#!/bin/bash
# معاينة قبل النشر: يبني نسخة staging من كود GitHub المرشّح ويشغّلها بجوار الإنتاج
# على منفذ مستقل (افتراضياً 8090) دون المساس بالحاويات العاملة.
#
# يُستدعى من خطّاف النشر:  STAGE_ACTION=up|down STAGE_REF=<sha|branch> bash deploy/server-stage.sh
# المخرجات المهمة (يقرأها التطبيق من سجل المهمة):
#   STAGE_COMMIT: <sha>      الإصدار الذي بُني فعلاً
#   STAGE_URL: <url>         رابط المعاينة
#   STAGE: OK | FAIL         النتيجة النهائية
set -e

ROOT="${WEAVER_ROOT:-/opt/weaver}"
STAGE_ROOT="${WEAVER_STAGE_ROOT:-/opt/weaver-stage}"
ENV_FILE="$ROOT/deploy/.env"
ACTION="${STAGE_ACTION:-up}"
REF="${STAGE_REF:-}"
PROJECT="weaver-stage"

if [ ! -f "$ENV_FILE" ]; then
  echo "ملف الإعدادات $ENV_FILE غير موجود"
  echo "STAGE: FAIL"
  exit 1
fi

read_env() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- || true; }

STAGE_PORT="$(read_env WEAVER_STAGE_PORT)"
STAGE_PORT="${STAGE_PORT:-8090}"

stop_stage() {
  echo "== إيقاف نسخة المعاينة =="
  if [ -f "$STAGE_ROOT/deploy/docker-compose.stage.yml" ]; then
    (cd "$STAGE_ROOT/deploy" && docker compose -p "$PROJECT" -f docker-compose.stage.yml down --remove-orphans) || true
  fi
  docker rm -f weaver-stage >/dev/null 2>&1 || true
  echo "STAGE: STOPPED"
}

if [ "$ACTION" = "down" ]; then
  stop_stage
  exit 0
fi

REPO_URL="$(read_env GITHUB_REPO_URL)"
TOKEN="$(read_env GITHUB_TOKEN)"
if [ -z "$REPO_URL" ] || [ -z "$TOKEN" ]; then
  echo "GITHUB_REPO_URL و GITHUB_TOKEN مطلوبان لبناء المعاينة"
  echo "STAGE: FAIL"
  exit 1
fi

SLUG="$(printf '%s' "$REPO_URL" | sed -E 's#(https?://)?(www\.)?github\.com/##; s#\.git$##; s#/+$##')"
if [ -z "$REF" ]; then
  REF="$(curl -sf -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/$SLUG" \
    | grep -o '"default_branch": *"[^"]*"' | head -1 | cut -d'"' -f4)"
fi
REF="${REF:-main}"

COMMIT="$(curl -sf -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/$SLUG/commits/$REF" \
  | grep -m1 '"sha"' | cut -d'"' -f4)"
COMMIT="${COMMIT:-$REF}"
echo "STAGE_COMMIT: $COMMIT"

echo "== سحب $SLUG@$REF للمعاينة =="
TMP="$(mktemp -d)"
curl -fsSL -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/$SLUG/tarball/$REF" -o "$TMP/src.tar.gz"
mkdir -p "$TMP/src"
tar xzf "$TMP/src.tar.gz" -C "$TMP/src" --strip-components=1

if [ ! -f "$TMP/src/package.json" ] || [ ! -f "$TMP/src/deploy/Dockerfile" ]; then
  echo "الأرشيف المسحوب غير صالح (package.json أو deploy/Dockerfile مفقود)"
  rm -rf "$TMP"
  echo "STAGE: FAIL"
  exit 1
fi

# مساحة معاينة منفصلة تماماً عن /opt/weaver حتى لا يلمس البناء الإنتاج إطلاقاً.
rm -rf "$STAGE_ROOT"
mkdir -p "$STAGE_ROOT"
cp -a "$TMP/src/." "$STAGE_ROOT/"
rm -rf "$TMP"

if [ ! -f "$STAGE_ROOT/deploy/docker-compose.stage.yml" ]; then
  echo "هذا الإصدار لا يحتوي deploy/docker-compose.stage.yml — لا يمكن بناء معاينة منه."
  echo "STAGE: FAIL"
  exit 1
fi

cp "$ENV_FILE" "$STAGE_ROOT/deploy/.env"
chmod 600 "$STAGE_ROOT/deploy/.env"

# شبكة الإنتاج الفعلية (اسمها يتبع اسم مشروع compose على الخادم).
NET="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' weaver-db 2>/dev/null | awk '{print $1}')"
NET="${NET:-deploy_weaver}"
echo "== الشبكة: $NET | المنفذ: $STAGE_PORT =="

stop_stage

echo "== بناء المعاينة (لا يمسّ الإنتاج) =="
cd "$STAGE_ROOT/deploy"
build_rc=0
WEAVER_NETWORK="$NET" WEAVER_STAGE_PORT="$STAGE_PORT" \
  timeout 3600 docker compose -p "$PROJECT" -f docker-compose.stage.yml up -d --build || build_rc=$?
if [ "$build_rc" -ne 0 ]; then
  echo "STAGE_BUILD: FAIL (rc=$build_rc)"
  stop_stage
  echo "STAGE: FAIL"
  exit 1
fi
echo "STAGE_BUILD: OK"

echo "== فحص صحة المعاينة =="
body=""
for i in $(seq 1 40); do
  body="$(curl -sf "http://127.0.0.1:$STAGE_PORT/api/public/live" || true)"
  case "$body" in *'"ok":true'*) break ;; esac
  sleep 5
done
echo "STAGE_HEALTH: ${body:-<no response>}"

HOST_IP="$(read_env WEAVER_STAGE_HOST)"
if [ -z "$HOST_IP" ]; then
  HOST_IP="$(curl -sf --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')"
fi
echo "STAGE_URL: http://$HOST_IP:$STAGE_PORT"

case "${body:-}" in
  *'"ok":true'*)
    echo "STAGE: OK"
    ;;
  *)
    echo "المعاينة بُنيت لكنها لم تستجب للفحص الصحي — راجع سجل الحاوية weaver-stage."
    docker logs --tail 60 weaver-stage 2>&1 || true
    echo "STAGE: FAIL"
    exit 1
    ;;
esac
