#!/usr/bin/env bash
# يربط دوميناً مخصّصاً بموقع منشور من Weaver على مسار /s/<slug>.
# يُستدعى من deploy/deploy-hook.mjs عبر أداة configure_custom_domain داخل المنصة.
#
# المتغيّرات المطلوبة:
#   DOMAIN=example.com
#   SLUG=coffee-shop
#   LE_EMAIL=you@example.com        (اختياري — بدونه يبقى الموقع على HTTP)
#   APP_UPSTREAM=127.0.0.1:8081     (اختياري)
set -euo pipefail

DOMAIN="${DOMAIN:-}"
SLUG="${SLUG:-}"
EMAIL="${LE_EMAIL:-}"
UPSTREAM="${APP_UPSTREAM:-127.0.0.1:8081}"

if [ -z "$DOMAIN" ] || [ -z "$SLUG" ]; then
  echo "DOMAIN و SLUG مطلوبان" >&2
  exit 2
fi
if ! printf '%s' "$DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'; then
  echo "دومين غير صالح: $DOMAIN" >&2
  exit 2
fi
if ! printf '%s' "$SLUG" | grep -Eq '^[a-z0-9][a-z0-9-]{0,60}$'; then
  echo "slug غير صالح: $SLUG" >&2
  exit 2
fi

AVAIL="/etc/nginx/sites-available/weaver-site-$DOMAIN"
ENABLED="/etc/nginx/sites-enabled/weaver-site-$DOMAIN"
mkdir -p /var/www/certbot

write_conf() {
  # $1 = http | ssl
  {
    echo "server {"
    echo "    listen 80;"
    echo "    listen [::]:80;"
    echo "    server_name $DOMAIN www.$DOMAIN;"
    echo "    server_tokens off;"
    echo "    location /.well-known/acme-challenge/ { root /var/www/certbot; }"
    if [ "$1" = "ssl" ]; then
      echo "    location / { return 301 https://\$host\$request_uri; }"
      echo "}"
      echo "server {"
      echo "    listen 443 ssl;"
      echo "    http2 on;"
      echo "    server_name $DOMAIN www.$DOMAIN;"
      echo "    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;"
      echo "    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;"
      echo "    ssl_protocols TLSv1.2 TLSv1.3;"
      echo "    add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;"
    fi
    echo "    server_tokens off;"
    echo "    add_header X-Content-Type-Options \"nosniff\" always;"
    echo "    add_header X-Frame-Options \"SAMEORIGIN\" always;"
    echo "    add_header Referrer-Policy \"strict-origin-when-cross-origin\" always;"
    echo "    location / {"
    echo "        proxy_pass http://$UPSTREAM/s/$SLUG\$request_uri;"
    echo "        proxy_http_version 1.1;"
    echo "        proxy_set_header Host \$http_host;"
    echo "        proxy_set_header X-Real-IP \$remote_addr;"
    echo "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
    echo "        proxy_set_header X-Forwarded-Proto \$scheme;"
    echo "        proxy_read_timeout 60s;"
    echo "    }"
    echo "}"
  } > "$AVAIL"
  ln -sf "$AVAIL" "$ENABLED"
  nginx -t
  systemctl reload nginx || nginx -s reload
}

echo "[domain] تهيئة $DOMAIN → /s/$SLUG"
write_conf http

if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "[domain] شهادة موجودة مسبقاً — تفعيل HTTPS"
  write_conf ssl
  echo "[domain] جاهز: https://$DOMAIN"
  exit 0
fi

if [ -z "$EMAIL" ]; then
  echo "[domain] لا يوجد LE_EMAIL — الموقع يعمل على HTTP فقط: http://$DOMAIN"
  exit 0
fi

if certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" -d "www.$DOMAIN" \
     --agree-tos --email "$EMAIL" -n; then
  write_conf ssl
  echo "[domain] جاهز: https://$DOMAIN"
else
  echo "[domain] تعذّر إصدار شهادة SSL — تحقّق من سجلات DNS ثم أعد المحاولة. الموقع يعمل على http://$DOMAIN"
  exit 1
fi
