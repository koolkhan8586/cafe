#!/usr/bin/env bash
# Repair nginx so cafe.khanmusa.com proxies to the Cafe LSAF app.
#
# No Docker — only nginx + the systemd-backed Node app on 127.0.0.1:3003.
#
# Symptom this fixes:
#   "404 Not Found nginx/1.18.0 (Ubuntu)" in the browser
# That page comes from nginx itself — it means cafe.khanmusa.com.conf was
# never copied into /etc/nginx/sites-available (other sites there are fine).
# A working proxy with a down app would be 502, not 404.
#
#   sudo /var/www/cafe/deploy/fix-nginx.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/cafe}"
DOMAIN="${DOMAIN:-cafe.khanmusa.com}"
APP_PORT="${APP_PORT:-3003}"
SERVICE="${SERVICE:-cafe-lsaf}"
CLOUDFLARE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --cloudflare) CLOUDFLARE=1; shift ;;
    --domain) DOMAIN="${2:?}"; shift 2 ;;
    --port) APP_PORT="${2:?}"; shift 2 ;;
    -h|--help)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

if [ ! -d "$APP_DIR/deploy/nginx" ]; then
  echo "ERROR: $APP_DIR/deploy/nginx not found. Clone the repo to $APP_DIR first." >&2
  exit 1
fi

cd "$APP_DIR"

echo "==> Current nginx sites-enabled"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || echo "    (none)"

echo "==> Checking whether the app answers on 127.0.0.1:${APP_PORT}"
app_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
  "http://127.0.0.1:${APP_PORT}/login" || true)"
if [ "$app_code" = "200" ]; then
  echo "    OK — HTTP $app_code from /login"
else
  echo "    WARN — app not ready (HTTP ${app_code:-none}). nginx will 502 until it is."
  if systemctl list-unit-files "${SERVICE}.service" >/dev/null 2>&1; then
    systemctl --no-pager --full status "$SERVICE" || true
    echo "    Try: sudo systemctl restart $SERVICE"
    echo "    Or full install: sudo $APP_DIR/deploy/install.sh --skip-certbot"
  else
    echo "    No systemd unit yet. Run: sudo $APP_DIR/deploy/install.sh"
  fi
fi

echo "==> Installing proxy snippet + site config"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y nginx >/dev/null

# Keep proxy_pass in sync with APP_PORT (repo default is 3003).
mkdir -p /etc/nginx/snippets
cp deploy/nginx/cafe-proxy.conf /etc/nginx/snippets/cafe-proxy.conf
if ! grep -q "127.0.0.1:${APP_PORT}" /etc/nginx/snippets/cafe-proxy.conf; then
  sed -i "s|http://127.0.0.1:[0-9]*|http://127.0.0.1:${APP_PORT}|" \
    /etc/nginx/snippets/cafe-proxy.conf
fi

SITE_SRC="deploy/nginx/cafe.khanmusa.com.conf"
SITE_NAME="${DOMAIN}.conf"
if [ "$CLOUDFLARE" -eq 1 ]; then
  SITE_SRC="deploy/nginx/cafe.khanmusa.com.cloudflare.conf"
  SITE_NAME="${DOMAIN}.cloudflare.conf"
  if [ ! -f /etc/ssl/cloudflare/${DOMAIN}.pem ] \
     && [ ! -f /etc/ssl/cloudflare/cafe.khanmusa.com.pem ]; then
    echo "ERROR: --cloudflare needs the origin certificate on disk." >&2
    echo "See deploy/DEPLOYMENT.md appendix." >&2
    exit 1
  fi
  "$APP_DIR/deploy/cloudflare/update-cloudflare-ips.sh" || true
fi

SITE_TMP="$(mktemp)"
cp "$SITE_SRC" "$SITE_TMP"
if [ "$DOMAIN" != "cafe.khanmusa.com" ]; then
  sed -i "s/cafe\.khanmusa\.com/${DOMAIN}/g" "$SITE_TMP"
fi

# Drop competing cafe / default sites so this Host is unambiguous.
rm -f /etc/nginx/sites-enabled/default \
      /etc/nginx/sites-enabled/cafe.khanmusa.com.conf \
      /etc/nginx/sites-enabled/cafe.khanmusa.com.cloudflare.conf \
      "/etc/nginx/sites-enabled/${DOMAIN}.conf" \
      "/etc/nginx/sites-enabled/${DOMAIN}.cloudflare.conf"

cp "$SITE_TMP" "/etc/nginx/sites-available/${SITE_NAME}"
ln -sfn "/etc/nginx/sites-available/${SITE_NAME}" "/etc/nginx/sites-enabled/${SITE_NAME}"
rm -f "$SITE_TMP"

echo "==> Testing and reloading nginx"
nginx -t
systemctl reload nginx

echo "==> Probing Host: ${DOMAIN} via 127.0.0.1:80"
public_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
  -H "Host: ${DOMAIN}" "http://127.0.0.1/login" || true)"
echo "    HTTP $public_code"

case "$public_code" in
  200|301|302|308)
    echo
    echo "nginx is proxying ${DOMAIN}. Open http://${DOMAIN} (then run certbot for HTTPS)."
    if [ "$app_code" != "200" ]; then
      echo "App still down — finish with: sudo systemctl restart $SERVICE"
    elif ! command -v certbot >/dev/null || ! [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
      echo "TLS next: sudo certbot --nginx -d ${DOMAIN}"
    fi
    ;;
  502|503|504)
    echo
    echo "nginx site is correct; upstream app is down (HTTP $public_code)."
    echo "  sudo systemctl restart $SERVICE"
    echo "  sudo journalctl -u $SERVICE -n 50 --no-pager"
    ;;
  404)
    echo
    echo "Still 404. Another server block may be winning. Inspect:"
    echo "  ls -la /etc/nginx/sites-enabled/"
    echo "  sudo nginx -T 2>/dev/null | grep -n 'server_name\\|listen '"
    exit 1
    ;;
  *)
    echo
    echo "Unexpected HTTP $public_code from nginx. Check:"
    echo "  sudo tail -50 /var/log/nginx/error.log"
    exit 1
    ;;
esac
