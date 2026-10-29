import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui";
import { MenuOrdering, type MenuCategory, type StaffOption } from "@/components/MenuOrdering";

export const dynamic = "force-dynamic";

/** Counter order entry: an admin or manager rings up an order for someone. */
export default async function CounterPage() {
  await requireRole(["ADMIN", "MANAGER"], "/counter");

  const [settings, categories, staff] = await Promise.all([
    getSettings(),
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            available: true,
          },
        },
      },
    }),
    prisma.staff.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  const withItems: MenuCategory[] = categories
    .map((category) => ({
      id: category.id,
      name: category.name,
      items: category.items,
    }))
    .filter((category) => category.items.length > 0);

  return (
    <>
      <PageHeader
        title="New order"
        subtitle="Ring up an order for a staff member or a walk-in customer."
      />
      {withItems.length === 0 ? (
        <EmptyState title="The menu is empty" hint="Add some items first." />
      ) : (
        <MenuOrdering
          categories={withItems}
          currency={settings.CURRENCY_SYMBOL}
          staffOptions={staff as StaffOption[]}
        />
      )}
    </>
  );
}
