#!/usr/bin/env bash
# First-time install of Cafe LSAF behind nginx at cafe.khanmusa.com.
#
# No Docker. The app runs under systemd; nginx proxies to 127.0.0.1:3003.
# (WAHA/WhatsApp is optional and documented separately.)
#
# Run on the Ubuntu/Debian VPS as root (or via sudo), from the repo:
#
#   sudo ./deploy/install.sh
#
# This copies deploy/nginx/cafe.khanmusa.com.conf into
# /etc/nginx/sites-available/ (it will not be there until you run this or
# deploy/fix-nginx.sh — other sites in that folder are unrelated).
#
# Optional flags:
#   --skip-certbot     Install nginx HTTP-only; you run certbot yourself later
#   --cloudflare        Use the Cloudflare-proxied site config (origin cert
#                      must already be at /etc/ssl/cloudflare/cafe.khanmusa.com.*)
#   --skip-seed        Do not seed baseline accounts (use when reinstalling
#                      over an existing database)
#   --domain NAME      Override the hostname (default: cafe.khanmusa.com)
#
# Prerequisites you handle yourself:
#   1. DNS A record for the domain → this server (see deploy/DEPLOYMENT.md)
#   2. Node 22+ on PATH (`node -v`)
#   3. Repo already cloned to APP_DIR (default /var/www/cafe)
#
# After this script: open https://cafe.khanmusa.com, change seeded PINs,
# then optionally start WAHA (step 7 in DEPLOYMENT.md) if you want WhatsApp.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/cafe}"
SERVICE="${SERVICE:-cafe-lsaf}"
APP_USER="${APP_USER:-cafe}"
DB_DIR="${DB_DIR:-/var/lib/cafe-lsaf}"
DOMAIN="${DOMAIN:-cafe.khanmusa.com}"
SKIP_CERTBOT=0
CLOUDFLARE=0
SKIP_SEED=0

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-certbot) SKIP_CERTBOT=1; shift ;;
    --cloudflare)    CLOUDFLARE=1; shift ;;
    --skip-seed)    SKIP_SEED=1; shift ;;
    --domain)       DOMAIN="${2:?}"; shift 2 ;;
    -h|--help)      usage 0 ;;
    *) echo "Unknown option: $1" >&2; usage 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo $0 $*" >&2
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  echo "ERROR: $APP_DIR does not exist. Clone the repo there first:" >&2
  echo "  sudo mkdir -p /var/www && sudo git clone <repo-url> $APP_DIR" >&2
  exit 1
fi

cd "$APP_DIR"

echo "==> Checking Node 22+"
if ! command -v node >/dev/null; then
  echo "ERROR: node not found. Install Node 22+ (see deploy/DEPLOYMENT.md §0)." >&2
  exit 1
fi
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: Node $NODE_MAJOR detected; need 22+. See deploy/DEPLOYMENT.md §0." >&2
  exit 1
fi
echo "    $(node -v)"

echo "==> Creating service user and database directory"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$DB_DIR"
chown -R "$APP_USER:$APP_USER" "$DB_DIR" "$APP_DIR"

echo "==> Configuring .env"
if [ ! -f .env ]; then
  cp .env.example .env
  SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  WAHA_KEY="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
  # Prefer portable sed -i without GNU-only empty suffix where possible.
  sed -i.bak \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=\"file:${DB_DIR}/cafe.db\"|" \
    -e "s|^SESSION_SECRET=.*|SESSION_SECRET=\"${SECRET}\"|" \
    -e "s|^WAHA_BASE_URL=.*|WAHA_BASE_URL=\"http://127.0.0.1:3001\"|" \
    -e "s|^WAHA_API_KEY=.*|WAHA_API_KEY=\"${WAHA_KEY}\"|" \
    .env
  rm -f .env.bak
  echo "    Wrote .env (SESSION_SECRET and WAHA_API_KEY generated)."
  echo "    Edit ADMIN_WHATSAPP_CHAT_ID later from the admin UI or .env."
else
  echo "    .env already present — leaving it alone."
fi
chown "$APP_USER:$APP_USER" .env
chmod 600 .env

# Fail early if production would refuse to boot.
if ! grep -qE '^SESSION_SECRET=".{16,}"' .env && ! grep -qE '^SESSION_SECRET=.{16,}' .env; then
  echo "ERROR: SESSION_SECRET in .env is missing or shorter than 16 characters." >&2
  exit 1
fi

echo "==> Installing npm dependencies (as $APP_USER)"
sudo -u "$APP_USER" npm ci

echo "==> Applying migrations"
sudo -u "$APP_USER" npx prisma migrate deploy

if [ "$SKIP_SEED" -eq 0 ]; then
  echo "==> Seeding baseline menu and accounts"
  sudo -u "$APP_USER" npx tsx prisma/seed.ts
else
  echo "==> Skipping seed (--skip-seed)"
fi

echo "==> Building"
sudo -u "$APP_USER" npm run build
if [ ! -d .next ]; then
  echo "ERROR: npm run build did not produce .next — systemd will fail to start." >&2
  exit 1
fi

echo "==> Freeing ports 3000 and 3003 if a leftover next process holds them"
for port in 3000 3003; do
  if ss -ltnp 2>/dev/null | grep -q ":${port} "; then
    if systemctl is-active --quiet "$SERVICE" 2>/dev/null; then
      systemctl stop "$SERVICE"
    else
      pkill -f "next start" 2>/dev/null || true
      pkill -f "next dev" 2>/dev/null || true
      sleep 1
    fi
  fi
done
# Next.js reads PORT from .env and ignores -p; keep it on 3003.
if grep -q '^PORT=' .env 2>/dev/null; then
  sed -i 's|^PORT=.*|PORT=3003|' .env
else
  echo 'PORT=3003' >> .env
fi
chown "$APP_USER:$APP_USER" .env

echo "==> Installing systemd unit"
cp deploy/systemd/cafe-lsaf.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now "$SERVICE"
systemctl --no-pager --full status "$SERVICE" || true

echo "==> Waiting for app on 127.0.0.1:3003"
ok=0
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3003/login || true)"
  if [ "$code" = "200" ]; then
    ok=1
    break
  fi
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  echo "ERROR: app did not become ready. Recent logs:" >&2
  journalctl -u "$SERVICE" -n 40 --no-pager >&2
  exit 1
fi
echo "    HTTP 200 from /login"

echo "==> Installing nginx"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y nginx

cp deploy/nginx/cafe-proxy.conf /etc/nginx/snippets/

SITE_SRC="deploy/nginx/cafe.khanmusa.com.conf"
SITE_NAME="cafe.khanmusa.com.conf"
if [ "$CLOUDFLARE" -eq 1 ]; then
  SITE_SRC="deploy/nginx/cafe.khanmusa.com.cloudflare.conf"
  SITE_NAME="cafe.khanmusa.com.cloudflare.conf"
  if [ ! -f /etc/ssl/cloudflare/cafe.khanmusa.com.pem ] \
     || [ ! -f /etc/ssl/cloudflare/cafe.khanmusa.com.key ]; then
    echo "ERROR: --cloudflare requires origin cert files at:" >&2
    echo "  /etc/ssl/cloudflare/cafe.khanmusa.com.pem" >&2
    echo "  /etc/ssl/cloudflare/cafe.khanmusa.com.key" >&2
    echo "See deploy/DEPLOYMENT.md appendix." >&2
    exit 1
  fi
  "$APP_DIR/deploy/cloudflare/update-cloudflare-ips.sh"
fi

# If the operator overrode --domain and is not using Cloudflare, rewrite
# server_name in a temp copy so the installed site matches.
SITE_TMP="$(mktemp)"
cp "$SITE_SRC" "$SITE_TMP"
if [ "$DOMAIN" != "cafe.khanmusa.com" ]; then
  sed -i "s/cafe\.khanmusa\.com/${DOMAIN}/g" "$SITE_TMP"
  SITE_NAME="${DOMAIN}.conf"
fi

# Never leave both the LE and Cloudflare site files enabled.
rm -f /etc/nginx/sites-enabled/cafe.khanmusa.com.conf \
      /etc/nginx/sites-enabled/cafe.khanmusa.com.cloudflare.conf \
      "/etc/nginx/sites-enabled/${DOMAIN}.conf" \
      "/etc/nginx/sites-enabled/${DOMAIN}.cloudflare.conf"

cp "$SITE_TMP" "/etc/nginx/sites-available/${SITE_NAME}"
ln -sfn "/etc/nginx/sites-available/${SITE_NAME}" "/etc/nginx/sites-enabled/${SITE_NAME}"
rm -f "$SITE_TMP"

# Drop the default site if it is still the only thing answering on :80.
if [ -L /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
fi

nginx -t
systemctl reload nginx
echo "    nginx site enabled for $DOMAIN"

if [ "$CLOUDFLARE" -eq 0 ] && [ "$SKIP_CERTBOT" -eq 0 ]; then
  echo "==> Issuing Let's Encrypt certificate for $DOMAIN"
  apt-get install -y certbot python3-certbot-nginx
  # Non-interactive; fails clearly if DNS is wrong or port 80 is blocked.
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect
  echo "    TLS ready. Login only works over HTTPS (Secure session cookie)."
elif [ "$SKIP_CERTBOT" -eq 1 ]; then
  echo "==> Skipping certbot. Run when DNS points here:"
  echo "    sudo certbot --nginx -d $DOMAIN"
  echo "    Do not sign in over plain HTTP — the Secure cookie will be dropped."
fi

echo "==> Firewall (ufw): allow OpenSSH + Nginx Full"
if command -v ufw >/dev/null; then
  ufw allow OpenSSH
  ufw allow 'Nginx Full'
  # Enable only if not already active, so we do not reset existing rules.
  if ! ufw status | grep -q 'Status: active'; then
    ufw --force enable
  fi
  ufw status
else
  echo "    ufw not installed — open 80/443 yourself."
fi

cat <<EOF

========================================================================
Cafe LSAF is installed for https://${DOMAIN}
(No Docker — app runs via systemd on 127.0.0.1:3003; nginx proxies to it.)

Next steps:
  1. Open https://${DOMAIN}/login and sign in as ADMIN / admin1234
  2. Staff → Reset PIN — change ADMIN, MANAGER, and every employee PIN
  3. WhatsApp is optional. Skip unless you want order alerts.
     If you do, see deploy/DEPLOYMENT.md step 7 (WAHA). Docker is only
     used for that optional piece, never for the cafe app itself.

  4. Later updates:  sudo ${APP_DIR}/deploy/deploy.sh

Full runbook: ${APP_DIR}/deploy/DEPLOYMENT.md
========================================================================
EOF
