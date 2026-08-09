#!/bin/bash
set -e

# One-command setup for Weaver on a fresh Ubuntu/Debian server.
# Run this script on the server as root or a sudo user.

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ]; then
    echo "Usage: ./setup.sh <domain> [email]"
    echo "Example: ./setup.sh weaver.example.com admin@example.com"
    echo "Use 'ip' for IP-only access (no HTTPS): ./setup.sh ip"
    exit 1
fi

if [ "$DOMAIN" = "ip" ]; then
    DOMAIN=""
    EMAIL=""
    echo "IP-only mode selected — HTTPS will be disabled."
fi

if [ -n "$DOMAIN" ] && [ -z "$EMAIL" ]; then
    echo "Email is required when a domain is set."
    exit 1
fi

# 1. Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Docker Compose is required. Installing plugin..."
    apt-get update && apt-get install -y docker-compose-plugin
fi

# 2. Create app directory
mkdir -p /opt/weaver

# 3. Copy deploy files if not already present
if [ ! -d /opt/weaver/deploy ]; then
    cp -r "$(dirname "$0")" /opt/weaver/deploy
fi

cd /opt/weaver/deploy

# 4. Generate environment
if [ ! -f .env ]; then
    cp .env.example .env
    if [ -n "$DOMAIN" ]; then
        sed -i "s/^WEAVER_DOMAIN=.*/WEAVER_DOMAIN=$DOMAIN/" .env
    fi
    if [ -n "$EMAIL" ]; then
        sed -i "s/^WEAVER_EMAIL=.*/WEAVER_EMAIL=$EMAIL/" .env
    fi
    echo "Generated .env — please edit it with your secrets before restarting the stack."
fi

# 5. Build and start
if docker compose version &> /dev/null; then
    docker compose up -d --build
else
    docker-compose up -d --build
fi

# 6. Print next steps
IP=$(curl -s https://api.ipify.org || echo "UNKNOWN")
echo ""
echo "Weaver is deploying."
if [ -n "$DOMAIN" ]; then
    echo "Point your domain ($DOMAIN) to $IP."
else
    echo "Access Weaver via IP: http://$IP"
fi
echo "Edit /opt/weaver/deploy/.env and restart with: docker compose up -d --build"
