import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { OrderBoard, type BoardOrder } from "@/components/OrderBoard";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  await requireRole(["ADMIN"], "/admin/orders");

  const [settings, orders] = await Promise.all([
    getSettings(),
    prisma.order.findMany({
      include: {
        items: true,
        staff: { select: { name: true, code: true, department: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const board: BoardOrder[] = orders.map((order) => ({
    id: order.id,
    status: order.status,
    subtotal: order.subtotal,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    staff: order.staff,
    items: order.items.map((item) => ({
      id: item.id,
      nameSnapshot: item.nameSnapshot,
      qty: item.qty,
      notes: item.notes,
    })),
  }));

  return (
    <>
      <PageHeader
        title="Counter"
        subtitle="Live orders. Move each one along as you make it."
      />
      <OrderBoard initialOrders={board} currency={settings.CURRENCY_SYMBOL} />
    </>
  );
}
