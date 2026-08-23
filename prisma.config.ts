import "dotenv/config";
import { defineConfig } from "prisma/config";

// Same default as src/lib/prisma.ts, so the CLI works before .env exists
// rather than failing with "datasource.url property is required".
const DEFAULT_DATABASE_URL = "file:./dev.db";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
  },
});
