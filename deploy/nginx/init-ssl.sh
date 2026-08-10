#!/bin/sh
set -e

DOMAIN="${WEAVER_DOMAIN}"
EMAIL="${WEAVER_EMAIL}"
CONF=/etc/nginx/nginx.conf

write_conf() {
  # $1 = "ssl" or "http"
  cat > "$CONF" <<EOF
events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 50m;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;

    upstream app { server app:3000; }
    upstream runtime { server runtime:4100; }

    server {
        listen 80;
        server_name ${DOMAIN:-_};

        location /.well-known/acme-challenge/ { root /var/www/certbot; }
EOF

  if [ "$1" = "ssl" ]; then
    cat >> "$CONF" <<EOF
        location / { return 301 https://\$host\$request_uri; }
    }

    server {
        listen 443 ssl;
        http2 on;
        server_name ${DOMAIN};

        ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;

$(proxy_block)
    }
}
EOF
  else
    cat >> "$CONF" <<EOF
$(proxy_block)
    }
}
EOF
  fi
}

proxy_block() {
  cat <<'EOF'
        # المعاينة الحيّة يجب أن تصل مباشرة إلى حاوية runtime.
        # وضع هذا المسار قبل location / يمنع تمريره إلى التطبيق ثم فشل fetch الداخلي.
        location ^~ /api/public/rt/ {
            proxy_pass http://runtime/p/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $http_host;
            proxy_read_timeout 86400;
            proxy_buffering off;
        }

        location / {
            proxy_pass http://app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $http_host;
            proxy_set_header X-Forwarded-Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 86400;
            proxy_buffering off;
        }
EOF
}

if [ -z "$DOMAIN" ]; then
    echo "No WEAVER_DOMAIN set - running HTTP-only (IP access)."
    write_conf http
    exec nginx -g "daemon off;"
fi

if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo "SSL certificate already exists for $DOMAIN."
    write_conf ssl
    exec nginx -g "daemon off;"
fi

if [ -z "$EMAIL" ]; then
    echo "WEAVER_EMAIL is required when WEAVER_DOMAIN is set. Falling back to HTTP-only."
    write_conf http
    exec nginx -g "daemon off;"
fi

# Temporary HTTP config to answer the ACME challenge
write_conf http
nginx

if certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --agree-tos --email "$EMAIL" -n; then
    echo "SSL certificate obtained for $DOMAIN."
    nginx -s stop || true
    sleep 2
    write_conf ssl
else
    echo "WARNING: Could not obtain SSL certificate. Falling back to HTTP-only."
    nginx -s stop || true
    sleep 2
    write_conf http
fi

exec nginx -g "daemon off;"
