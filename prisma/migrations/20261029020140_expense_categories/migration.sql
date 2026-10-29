-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "ExpenseCategory_active_idx" ON "ExpenseCategory"("active");

-- Seed the categories the app previously hardcoded, so the dropdown is
-- populated the moment this migration runs rather than waiting for a seed
-- script that production may never execute.
INSERT INTO "ExpenseCategory" ("id", "name", "sortOrder", "active", "createdAt", "updatedAt") VALUES
  ('exc_seed_supplies',    'Supplies',    0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exc_seed_rent',        'Rent',        1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exc_seed_salaries',    'Salaries',    2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exc_seed_utilities',   'Utilities',   3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exc_seed_gas',         'Gas',         4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exc_seed_maintenance', 'Maintenance', 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('exc_seed_other',       'Other',       6, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Carry over any category already used by an existing expense that is not in
-- that list. Without this, an expense filed under a category added by hand
-- before this release would keep its label but the name would be missing from
-- the form, so it could never be chosen again.
INSERT INTO "ExpenseCategory" ("id", "name", "sortOrder", "active", "createdAt", "updatedAt")
SELECT
  'exc_' || lower(hex(randomblob(12))),
  used."category",
  100,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "category" FROM "Expense") AS used
WHERE used."category" NOT IN (SELECT "name" FROM "ExpenseCategory");
