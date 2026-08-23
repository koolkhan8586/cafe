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

sleep 3
if systemctl is-active --quiet "$SERVICE"; then
  echo "==> $SERVICE is running"
else
  echo "==> $SERVICE failed to start; recent logs:" >&2
  journalctl -u "$SERVICE" -n 30 --no-pager >&2
  exit 1
fi
