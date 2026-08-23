/**
 * Optional: generate a few weeks of plausible past orders so the manager
 * reports have something to show. Safe to run more than once — it only tops up
 * days that have no orders yet. Never run this against real cafe data.
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const DAYS = 30;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

async function main() {
  const employees = await prisma.staff.findMany({ where: { role: "EMPLOYEE" } });
  const menu = await prisma.menuItem.findMany({ where: { available: true } });

  if (employees.length === 0 || menu.length === 0) {
    console.error("Run `npm run db:seed` first — no employees or menu items found.");
    process.exitCode = 1;
    return;
  }

  let created = 0;

  for (let dayOffset = DAYS; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - dayOffset);
    day.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    const existing = await prisma.order.count({
      where: { createdAt: { gte: day, lte: dayEnd } },
    });
    if (existing > 0) continue;

    // Weekends are quiet in an office cafe.
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const orderCount = isWeekend ? randomInt(0, 3) : randomInt(6, 16);

    for (let n = 0; n < orderCount; n += 1) {
      const placedAt = new Date(day);
      placedAt.setHours(randomInt(8, 17), randomInt(0, 59), 0, 0);

      const employee = pick(employees);
      const lineCount = randomInt(1, 3);
      const chosen = new Map<string, number>();
      for (let l = 0; l < lineCount; l += 1) {
        const item = pick(menu);
        chosen.set(item.id, (chosen.get(item.id) ?? 0) + randomInt(1, 2));
      }

      const items = [...chosen.entries()].map(([id, qty]) => {
        const item = menu.find((m) => m.id === id)!;
        return {
          menuItemId: item.id,
          nameSnapshot: item.name,
          unitPrice: item.price,
          unitCost: item.costPrice,
          qty,
          lineTotal: item.price * qty,
          notes: null,
        };
      });

      const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
      const totalCost = items.reduce((sum, i) => sum + i.unitCost * i.qty, 0);
      // Roughly one order in twenty gets cancelled, as in real life.
      const status = randomInt(1, 20) === 1 ? "CANCELLED" : "COMPLETED";

      await prisma.order.create({
        data: {
          staffId: employee.id,
          status,
          department: employee.department,
          subtotal,
          totalCost,
          createdAt: placedAt,
          updatedAt: placedAt,
          completedAt: status === "COMPLETED" ? placedAt : null,
          items: { create: items },
        },
      });
      created += 1;
    }
  }

  console.log(`Created ${created} demo orders across the last ${DAYS} days.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
