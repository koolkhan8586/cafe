import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { MenuManager, type ManagedItem } from "@/components/MenuManager";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  await requireRole(["ADMIN"], "/admin/menu");

  const [settings, categories, items] = await Promise.all([
    getSettings(),
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.menuItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const managed: ManagedItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    costPrice: item.costPrice,
    available: item.available,
    categoryId: item.categoryId,
  }));

  return (
    <>
      <PageHeader
        title="Manage menu"
        subtitle="Set what the cafe sells, what it charges, and what each item costs to make."
      />
      <MenuManager
        initialItems={managed}
        initialCategories={categories.map((c) => ({ id: c.id, name: c.name }))}
        currency={settings.CURRENCY_SYMBOL}
      />
    </>
  );
}
