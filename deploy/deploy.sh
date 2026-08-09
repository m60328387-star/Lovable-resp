#!/bin/bash
set -e

# Deploy Weaver to the Contabo VPS.
# Run this from the project root once the server's authorized_keys contains
# the public key in /mnt/documents/weaver-deploy/id_ed25519.pub

SERVER="${WEAVER_SERVER:-root@194.163.155.52}"
# Persistent location so the key survives sandbox restarts (/tmp is wiped).
KEY="${WEAVER_DEPLOY_KEY:-/mnt/documents/weaver-deploy/id_ed25519}"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"
SCP="scp -i $KEY -o StrictHostKeyChecking=accept-new"

ARCHIVE="/tmp/weaver-source.tar.gz"
ENV_LOCAL="/tmp/weaver-deploy.env"

# Reuse secrets already present on the server so redeploys keep working with
# the existing Postgres volume and active sessions.
REMOTE_ENV="$($SSH "$SERVER" 'cat /opt/weaver/deploy/.env 2>/dev/null || true')"
remote_var() {
  printf '%s\n' "$REMOTE_ENV" | grep "^$1=" | head -n1 | cut -d= -f2-
}

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(remote_var POSTGRES_PASSWORD)}"
export WEAVER_SCHEDULER_SECRET="${WEAVER_SCHEDULER_SECRET:-$(remote_var WEAVER_SCHEDULER_SECRET)}"
export WEAVER_WORKER_TOKEN="${WEAVER_WORKER_TOKEN:-$(remote_var WEAVER_WORKER_TOKEN)}"
export SESSION_SECRET="${SESSION_SECRET:-$(remote_var SESSION_SECRET)}"

# Generate any secret that does not exist yet
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 32)}"
export WEAVER_SCHEDULER_SECRET="${WEAVER_SCHEDULER_SECRET:-$(openssl rand -hex 32)}"
export WEAVER_WORKER_TOKEN="${WEAVER_WORKER_TOKEN:-$(openssl rand -hex 32)}"
export SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 48)}"

# Ensure required user-provided variables are present
if [ -z "${WEAVER_OWNER_EMAIL:-}" ] || [ -z "${WEAVER_PASSCODE:-}" ] || [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "Missing required environment variables: WEAVER_OWNER_EMAIL, WEAVER_PASSCODE, OPENROUTER_API_KEY"
  exit 1
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_PUBLISHABLE_KEY:-}" ]; then
  echo "Missing required database client variables: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY"
  exit 1
fi

echo "Deploying to $SERVER ..."

# 1. Ensure Docker is installed on the server
$SSH "$SERVER" '
  if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
  fi
  if ! docker compose version &> /dev/null; then
    apt-get update && apt-get install -y docker-compose-plugin
  fi
'

# 2. Package the project source (excluding build artifacts, dependencies, and local env)
rm -f "$ARCHIVE"
tar czf "$ARCHIVE" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='.output' \
  --exclude='.wrangler' \
  --exclude='*.tar.gz' \
  --exclude='.env' \
  .

# 3. Generate .env locally
python3 - "$ENV_LOCAL" <<'PYEOF'
import os, sys
from pathlib import Path
out = Path(sys.argv[1])
out.write_text(f"""NODE_ENV=production
HOST=0.0.0.0
PORT=3000
POSTGRES_USER=weaver
POSTGRES_PASSWORD={os.environ['POSTGRES_PASSWORD']}
POSTGRES_DB=weaver
DATABASE_URL=postgresql://weaver:{os.environ['POSTGRES_PASSWORD']}@db:5432/weaver
SESSION_SECRET={os.environ['SESSION_SECRET']}
WEAVER_DOMAIN=
WEAVER_EMAIL={os.environ['WEAVER_OWNER_EMAIL']}
OPENROUTER_API_KEY={os.environ['OPENROUTER_API_KEY']}
OPENROUTER_MODEL=openrouter/auto
GEMINI_API_KEY={os.environ.get('GEMINI_API_KEY', '')}
GROQ_API_KEY={os.environ.get('GROQ_API_KEY', '')}
SUPABASE_URL={os.environ['SUPABASE_URL']}
SUPABASE_PUBLISHABLE_KEY={os.environ['SUPABASE_PUBLISHABLE_KEY']}
SUPABASE_SERVICE_ROLE_KEY={os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')}
GITHUB_TOKEN={os.environ.get('GITHUB_TOKEN', '')}
GITHUB_REPO_URL={os.environ.get('GITHUB_REPO_URL', '')}
WEAVER_OWNER_EMAIL={os.environ['WEAVER_OWNER_EMAIL']}
WEAVER_PASSCODE={os.environ['WEAVER_PASSCODE']}
WEAVER_SCHEDULER_SECRET={os.environ['WEAVER_SCHEDULER_SECRET']}
WEAVER_WORKER_TOKEN={os.environ['WEAVER_WORKER_TOKEN']}
EXECUTOR_TOKEN={os.environ.get('EXECUTOR_TOKEN', '')}
""")
PYEOF

# 4. Copy source and deploy files
$SSH "$SERVER" 'mkdir -p /opt/weaver'
$SCP "$ARCHIVE" "$SERVER:/opt/weaver/source.tar.gz"
$SCP "$ENV_LOCAL" "$SERVER:/opt/weaver/deploy.env"
$SCP "deploy/deploy.sh" "$SERVER:/opt/weaver/deploy.sh"
rm -f "$ENV_LOCAL"

# 5. Extract, place .env, and start the stack on the server
$SSH "$SERVER" '
  cd /opt/weaver
  rm -rf src deploy
  tar xzf source.tar.gz
  rm -f source.tar.gz
  mv deploy.env deploy/.env
  cd /opt/weaver/deploy
  docker compose up -d --build
  # ترحيلات إضافية idempotent على قاعدة بيانات قائمة (سكربتات init تعمل مرة واحدة فقط)
  for i in $(seq 1 30); do docker compose exec -T db pg_isready -U weaver && break; sleep 2; done
  for f in db/init/03-agent-jobs.sql db/init/04-audit-connectors.sql; do
    [ -f "$f" ] && docker compose exec -T db psql -U weaver -d weaver -v ON_ERROR_STOP=1 < "$f"
  done
'


# 6. التحقق بعد النشر: الصحة + ملفات الواجهة + صفحة الدخول
echo "Verifying deployment ..."
VERIFY_OUTPUT="$($SSH "$SERVER" '
  set -e
  cd /opt/weaver/deploy
  PORT="${WEAVER_HTTP_PORT:-8081}"
  ok=1

  for i in $(seq 1 40); do
    body=$(curl -sf "http://127.0.0.1:$PORT/api/public/health" || true)
    case "$body" in *\"ok\":true*) break;; esac
    sleep 5
  done
  echo "HEALTH: ${body:-<no response>}"
  case "${body:-}" in *\"ok\":true*) ;; *) ok=0;; esac

  auth=$(curl -s -o /tmp/auth.html -w "%{http_code}" "http://127.0.0.1:$PORT/auth" || true)
  echo "AUTH_STATUS: $auth"
  [ "$auth" = "200" ] || ok=0

  if grep -qE "<script[^>]+src=" /tmp/auth.html; then
    echo "ASSETS: present"
  else
    echo "ASSETS: missing"
    ok=0
  fi

  if grep -qi "Missing Supabase environment" /tmp/auth.html; then
    echo "ENV_ALERT: VITE_SUPABASE_* missing in client bundle"
    ok=0
  fi

  logs=$(docker compose logs --tail 200 app worker 2>/dev/null || true)
  echo "$logs" | grep -iE "VITE_SUPABASE|WEAVER_WORKER_TOKEN" | tail -n 10 | sed "s/^/LOG_ALERT: /" || true

  echo "STATE:"
  docker compose ps --format "  {{.Service}} {{.State}} {{.Status}}"

  [ "$ok" = "1" ] && echo "VERIFY: PASS" || echo "VERIFY: FAIL"
')"
echo "$VERIFY_OUTPUT"

if ! printf '%s' "$VERIFY_OUTPUT" | grep -q "VERIFY: PASS"; then
  echo "Post-deploy verification FAILED — deployment is not considered successful."
  rm -f "$ARCHIVE"
  exit 1
fi

rm -f "$ARCHIVE"
echo "Done. Site will be available at http://194.163.155.52 (once DNS/domain is linked, use that instead)."
