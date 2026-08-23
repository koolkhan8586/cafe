#!/usr/bin/env bash
# Pull the latest code and restart Cafe LSAF.
#
#   sudo /var/www/cafe/deploy/deploy.sh
#
# Safe to re-run. Migrations are applied before the new build goes live, and
# the service is only restarted once the build succeeds — a failed build
# leaves the previous version serving.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/cafe}"
SERVICE="${SERVICE:-cafe-lsaf}"

cd "$APP_DIR"

echo "==> Fetching latest code"
git pull --ff-only

echo "==> Installing dependencies"
npm ci

echo "==> Applying database migrations"
npx prisma migrate deploy

echo "==> Building"
npm run build

echo "==> Restarting $SERVICE"
systemctl restart "$SERVICE"

# Poll the app itself rather than trusting `systemctl is-active`: a service
# caught in a restart loop reports "active" during each attempt, so a process
# check alone can report success while the site is down.
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT:-3003}/login}"
echo "==> Waiting for $HEALTH_URL"

for _ in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" || true)"
  if [ "$code" = "200" ]; then
    echo "==> $SERVICE is serving (HTTP 200)"
    exit 0
  fi
  sleep 1
done

echo "==> $SERVICE is not serving $HEALTH_URL (last status: ${code:-none})" >&2
echo "==> Recent logs:" >&2
journalctl -u "$SERVICE" -n 40 --no-pager >&2
exit 1
