# Build in one stage, run the Next.js server in the next. The runtime keeps
# devDependencies because the entrypoint runs prisma migrate and the seed.
FROM node:22-slim AS builder
WORKDIR /app

# openssl is needed by Prisma; python3/make/g++ build better-sqlite3 when no
# prebuilt binary matches the platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# The build only needs a syntactically valid URL; the real one is set at runtime.
ENV DATABASE_URL="file:/tmp/build.db"
RUN npx prisma generate && npm run build


FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

ENV PORT=3003
EXPOSE 3003
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
