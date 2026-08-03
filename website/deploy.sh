#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${CODEX_CLAW_WEBSITE_HOST:-joshua}"
REMOTE_ROOT="${CODEX_CLAW_WEBSITE_ROOT:-/var/www/codex-claw}"
NGINX_CONFIG="${CODEX_CLAW_NGINX_CONFIG:-/etc/nginx/sites-available/codex-claw.nabocorp.com.conf}"
NGINX_BOOTSTRAP_CONFIG="/etc/nginx/sites-available/codex-claw.nabocorp.com.bootstrap.conf"

echo "Deploying Codex Claw website to ${HOST}:${REMOTE_ROOT}"
ssh "$HOST" "sudo mkdir -p '$REMOTE_ROOT/site' && sudo chown -R \"\$(id -un):\$(id -gn)\" '$REMOTE_ROOT'"
tar --exclude 'deploy.sh' -czf - -C "$ROOT_DIR" . | ssh "$HOST" "tar -xzf - -C '$REMOTE_ROOT/site'"
if ! ssh "$HOST" "test -f /etc/letsencrypt/live/codex-claw.nabocorp.com/fullchain.pem"; then
  echo "No TLS certificate found; provisioning one with Certbot"
  scp "$ROOT_DIR/nginx-bootstrap.conf" "$HOST:/tmp/codex-claw.nabocorp.com.bootstrap.conf"
  ssh "$HOST" "sudo install -m 0644 /tmp/codex-claw.nabocorp.com.bootstrap.conf '$NGINX_BOOTSTRAP_CONFIG' && sudo ln -sfn '$NGINX_BOOTSTRAP_CONFIG' /etc/nginx/sites-enabled/codex-claw.nabocorp.com.conf && sudo nginx -t && sudo systemctl reload nginx && sudo certbot certonly --webroot -w '$REMOTE_ROOT/site' -d codex-claw.nabocorp.com --non-interactive --agree-tos --register-unsafely-without-email && sudo rm -f /tmp/codex-claw.nabocorp.com.bootstrap.conf '$NGINX_BOOTSTRAP_CONFIG'"
fi
scp "$ROOT_DIR/nginx.conf" "$HOST:/tmp/codex-claw.nabocorp.com.conf"
ssh "$HOST" "sudo install -m 0644 /tmp/codex-claw.nabocorp.com.conf '$NGINX_CONFIG' && sudo ln -sfn '$NGINX_CONFIG' /etc/nginx/sites-enabled/codex-claw.nabocorp.com.conf && sudo nginx -t && sudo systemctl reload nginx && sudo rm -f /tmp/codex-claw.nabocorp.com.conf"
echo "Deployed: https://codex-claw.nabocorp.com"
