import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { MenuOrdering, type MenuCategory } from "@/components/MenuOrdering";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const user = await requireUser("/menu");
  const [settings, categories] = await Promise.all([
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
        title={`Good to see you, ${user.name.split(" ")[0]}`}
        subtitle="Pick what you want and send it to the counter."
      />
      {withItems.length === 0 ? (
        <EmptyState
          title="The menu is empty"
          hint="Ask the cafe admin to add some items."
        />
      ) : (
        <MenuOrdering categories={withItems} currency={settings.CURRENCY_SYMBOL} />
      )}
    </>
  );
}
