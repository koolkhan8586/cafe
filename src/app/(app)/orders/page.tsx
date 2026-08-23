import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import type { OrderStatus } from "@/lib/types";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MyOrdersPage() {
  const user = await requireUser("/orders");
  const [settings, orders] = await Promise.all([
    getSettings(),
    prisma.order.findMany({
      where: { staffId: user.sub },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const currency = settings.CURRENCY_SYMBOL;
  const spent = orders
    .filter((o) => o.status !== "CANCELLED")
    .reduce((sum, o) => sum + o.subtotal, 0);

  return (
    <>
      <PageHeader
        title="My orders"
        subtitle={
          orders.length > 0
            ? `${orders.length} order${orders.length === 1 ? "" : "s"} · ${formatMoney(spent, currency)} spent`
            : undefined
        }
      />

      {orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          hint="Head to the menu and send your first one to the counter."
          icon="🧾"
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">Order #{order.id}</span>
                  <StatusBadge status={order.status as OrderStatus} />
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">
                    {formatMoney(order.subtotal, currency)}
                  </p>
                  <p className="text-xs text-muted">
                    {order.createdAt.toLocaleString("en-GB")}
                  </p>
                </div>
              </div>

              <ul className="mt-3 space-y-1 text-sm text-muted">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.qty} × {item.nameSnapshot}
                    {item.notes ? (
                      <span className="italic"> — {item.notes}</span>
                    ) : null}
                  </li>
                ))}
              </ul>

              {order.notes ? (
                <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-sm">
                  📝 {order.notes}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
