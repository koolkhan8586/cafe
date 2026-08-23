#!/bin/sh
# Apply any pending migrations, then seed once so a fresh volume comes up with
# a working menu and an admin account. Seeding is idempotent.
set -e

echo "Applying database migrations…"
npx prisma migrate deploy

if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "Seeding baseline data…"
  npx tsx prisma/seed.ts
fi

exec "$@"
