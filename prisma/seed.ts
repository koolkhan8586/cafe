import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

// Prices are in minor units (paisa). Rs 250.00 -> 25000.
const MENU: {
  category: string;
  items: { name: string; description: string; price: number; cost: number }[];
}[] = [
  {
    category: "Hot Drinks",
    items: [
      { name: "Karak Chai", description: "Strong milk tea, the house default.", price: 8000, cost: 2500 },
      { name: "Doodh Patti", description: "Full-milk tea, no water.", price: 12000, cost: 4500 },
      { name: "Espresso", description: "Double shot.", price: 22000, cost: 7000 },
      { name: "Cappuccino", description: "Espresso with steamed milk and foam.", price: 32000, cost: 11000 },
      { name: "Green Tea", description: "Loose leaf with lemon.", price: 9000, cost: 2000 },
    ],
  },
  {
    category: "Cold Drinks",
    items: [
      { name: "Iced Latte", description: "Espresso over milk and ice.", price: 35000, cost: 13000 },
      { name: "Fresh Lime", description: "Lime, mint, soda.", price: 18000, cost: 5000 },
      { name: "Mango Shake", description: "Seasonal, blended fresh.", price: 30000, cost: 14000 },
      { name: "Bottled Water", description: "500ml.", price: 6000, cost: 4000 },
    ],
  },
  {
    category: "Snacks",
    items: [
      { name: "Chicken Samosa", description: "Two pieces with chutney.", price: 15000, cost: 6000 },
      { name: "Club Sandwich", description: "Chicken, egg, fries on the side.", price: 45000, cost: 22000 },
      { name: "Chicken Roll", description: "Paratha roll with garlic mayo.", price: 38000, cost: 18000 },
      { name: "French Fries", description: "Regular portion.", price: 20000, cost: 7000 },
    ],
  },
  {
    category: "Lunch",
    items: [
      { name: "Daal Chawal", description: "Daily daal with rice and salad.", price: 40000, cost: 17000 },
      { name: "Chicken Biryani", description: "Served with raita.", price: 55000, cost: 28000 },
      { name: "Chicken Karahi (half)", description: "With two rotis.", price: 90000, cost: 52000 },
    ],
  },
  {
    category: "Desserts",
    items: [
      { name: "Chocolate Brownie", description: "Warm, with a scoop.", price: 28000, cost: 11000 },
      { name: "Kheer", description: "Rice pudding, chilled.", price: 18000, cost: 6000 },
    ],
  },
];

const STAFF: {
  code: string;
  name: string;
  role: string;
  department?: string;
  secret: string;
  whatsapp?: string;
}[] = [
  { code: "ADMIN", name: "Cafe Admin", role: "ADMIN", secret: "admin1234" },
  { code: "MANAGER", name: "Cafe Manager", role: "MANAGER", secret: "manager1234" },
  { code: "LSAF-001", name: "Ayesha Siddiqui", role: "EMPLOYEE", department: "Finance", secret: "1234" },
  { code: "LSAF-002", name: "Bilal Ahmed", role: "EMPLOYEE", department: "Engineering", secret: "1234" },
  { code: "LSAF-003", name: "Hina Raza", role: "EMPLOYEE", department: "Engineering", secret: "1234" },
  { code: "LSAF-004", name: "Usman Tariq", role: "EMPLOYEE", department: "Operations", secret: "1234" },
  { code: "LSAF-005", name: "Sana Malik", role: "EMPLOYEE", department: "HR", secret: "1234" },
];

async function main() {
  console.log("Seeding Cafe LSAF…");

  for (const person of STAFF) {
    const pinHash = await bcrypt.hash(person.secret, 10);
    await prisma.staff.upsert({
      where: { code: person.code },
      update: {
        name: person.name,
        role: person.role,
        department: person.department ?? null,
        whatsapp: person.whatsapp ?? null,
      },
      // The PIN is only set on create, so re-seeding never resets a real
      // password that someone has already changed.
      create: {
        code: person.code,
        name: person.name,
        role: person.role,
        department: person.department ?? null,
        whatsapp: person.whatsapp ?? null,
        pinHash,
      },
    });
  }
  console.log(`  ${STAFF.length} staff accounts ready`);

  let itemCount = 0;
  for (const [index, group] of MENU.entries()) {
    const category = await prisma.category.upsert({
      where: { name: group.category },
      update: { sortOrder: index },
      create: { name: group.category, sortOrder: index },
    });

    for (const [itemIndex, item] of group.items.entries()) {
      const existing = await prisma.menuItem.findFirst({
        where: { name: item.name, categoryId: category.id },
      });
      if (existing) {
        await prisma.menuItem.update({
          where: { id: existing.id },
          data: { sortOrder: itemIndex },
        });
      } else {
        await prisma.menuItem.create({
          data: {
            name: item.name,
            description: item.description,
            price: item.price,
            costPrice: item.cost,
            categoryId: category.id,
            sortOrder: itemIndex,
          },
        });
      }
      itemCount += 1;
    }
  }
  console.log(`  ${MENU.length} categories, ${itemCount} menu items ready`);

  console.log("\nSign in with:");
  console.log("  Admin    ADMIN    / admin1234");
  console.log("  Manager  MANAGER  / manager1234");
  console.log("  Employee LSAF-001 / 1234");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
