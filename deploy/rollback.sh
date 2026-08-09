#!/usr/bin/env bash
# تراجع سريع: يعيد المنصة إلى آخر إصدار ناجح (الالتزام السابق) ويعيد البناء.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[weaver] rolling back to previous commit…"
git fetch --all --quiet || true

if git rev-parse --verify weaver-last-good >/dev/null 2>&1; then
  echo "[weaver] restoring tag weaver-last-good"
  git reset --hard weaver-last-good
else
  echo "[weaver] no tag found — falling back to HEAD~1"
  git reset --hard HEAD~1
fi

docker compose -f deploy/docker-compose.yml up -d --build
sleep 5
curl -fsS http://127.0.0.1:3000/ >/dev/null && echo "[weaver] rollback healthy" || echo "[weaver] warning: health check failed"
