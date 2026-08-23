import "server-only";
import { prisma } from "@/lib/prisma";
import { REVENUE_STATUSES } from "@/lib/types";

/**
 * Reporting rules used everywhere in the manager section:
 *  - Cancelled orders are excluded from revenue, cost and profit.
 *  - Money is in minor units throughout; format only at the edge.
 *  - Cost figures come from the snapshot taken at order time, so changing a
 *    menu item's cost today never rewrites last month's profit.
 */

export type DateRange = { from: Date; to: Date };

/** Inclusive of `from`, exclusive of the day after `to`. */
export function rangeFromParams(
  fromParam?: string,
  toParam?: string,
  fallbackDays = 30,
): DateRange {
  const to = toParam ? endOfDay(new Date(toParam)) : endOfDay(new Date());
  const from = fromParam
    ? startOfDay(new Date(fromParam))
    : startOfDay(new Date(to.getTime() - fallbackDays * 24 * 60 * 60 * 1000));

  // Guard against unparseable input rather than querying with Invalid Date.
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    const now = new Date();
    return {
      from: startOfDay(new Date(now.getTime() - fallbackDays * 86_400_000)),
      to: endOfDay(now),
    };
  }
  return from > to ? { from: startOfDay(to), to: endOfDay(from) } : { from, to };
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type SalesSummary = {
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
  itemCount: number;
  averageOrder: number;
  cancelledCount: number;
};

export type DailyPoint = { date: string; revenue: number; profit: number; orders: number };
export type TopItem = {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
};
export type DepartmentRow = { department: string; orders: number; revenue: number };
export type EmployeeRow = {
  name: string;
  code: string;
  department: string | null;
  orders: number;
  revenue: number;
};

export type SalesReport = {
  summary: SalesSummary;
  daily: DailyPoint[];
  topItems: TopItem[];
  byDepartment: DepartmentRow[];
  byEmployee: EmployeeRow[];
};

export async function buildSalesReport(range: DateRange): Promise<SalesReport> {
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    include: {
      items: true,
      staff: { select: { name: true, code: true, department: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const counted = orders.filter((o) => REVENUE_STATUSES.includes(o.status as never));
  const cancelledCount = orders.length - counted.length;

  const revenue = counted.reduce((sum, o) => sum + o.subtotal, 0);
  const cost = counted.reduce((sum, o) => sum + o.totalCost, 0);
  const itemCount = counted.reduce(
    (sum, o) => sum + o.items.reduce((n, i) => n + i.qty, 0),
    0,
  );

  const dailyMap = new Map<string, DailyPoint>();
  const itemMap = new Map<string, TopItem>();
  const deptMap = new Map<string, DepartmentRow>();
  const staffMap = new Map<string, EmployeeRow>();

  for (const order of counted) {
    const day = toDateInput(order.createdAt);
    const point = dailyMap.get(day) ?? { date: day, revenue: 0, profit: 0, orders: 0 };
    point.revenue += order.subtotal;
    point.profit += order.subtotal - order.totalCost;
    point.orders += 1;
    dailyMap.set(day, point);

    for (const item of order.items) {
      const entry =
        itemMap.get(item.nameSnapshot) ??
        { name: item.nameSnapshot, qty: 0, revenue: 0, cost: 0, profit: 0 };
      entry.qty += item.qty;
      entry.revenue += item.lineTotal;
      entry.cost += item.unitCost * item.qty;
      entry.profit = entry.revenue - entry.cost;
      itemMap.set(item.nameSnapshot, entry);
    }

    // Fall back to the employee's current department for orders placed before
    // the snapshot column existed.
    const dept = order.department ?? order.staff.department ?? "Unassigned";
    const deptRow = deptMap.get(dept) ?? { department: dept, orders: 0, revenue: 0 };
    deptRow.orders += 1;
    deptRow.revenue += order.subtotal;
    deptMap.set(dept, deptRow);

    const staffRow =
      staffMap.get(order.staff.code) ?? {
        name: order.staff.name,
        code: order.staff.code,
        department: order.staff.department,
        orders: 0,
        revenue: 0,
      };
    staffRow.orders += 1;
    staffRow.revenue += order.subtotal;
    staffMap.set(order.staff.code, staffRow);
  }

  return {
    summary: {
      revenue,
      cost,
      profit: revenue - cost,
      orderCount: counted.length,
      itemCount,
      averageOrder: counted.length ? Math.round(revenue / counted.length) : 0,
      cancelledCount,
    },
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    topItems: [...itemMap.values()].sort((a, b) => b.revenue - a.revenue),
    byDepartment: [...deptMap.values()].sort((a, b) => b.revenue - a.revenue),
    byEmployee: [...staffMap.values()].sort((a, b) => b.revenue - a.revenue),
  };
}

export type CostRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  costPrice: number;
  unitProfit: number;
  margin: number | null;
  available: boolean;
  qtySold: number;
  revenue: number;
  profit: number;
};

/** Per-item economics: the static price/cost picture plus what actually sold. */
export async function buildCostReport(range: DateRange): Promise<CostRow[]> {
  const [items, sold] = await Promise.all([
    prisma.menuItem.findMany({
      include: { category: true },
      orderBy: [
        { category: { sortOrder: "asc" } },
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    }),
    prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { gte: range.from, lte: range.to },
          status: { in: [...REVENUE_STATUSES] },
        },
      },
      select: {
        menuItemId: true,
        qty: true,
        lineTotal: true,
        unitCost: true,
      },
    }),
  ]);

  const soldMap = new Map<string, { qty: number; revenue: number; cost: number }>();
  for (const line of sold) {
    if (!line.menuItemId) continue;
    const entry = soldMap.get(line.menuItemId) ?? { qty: 0, revenue: 0, cost: 0 };
    entry.qty += line.qty;
    entry.revenue += line.lineTotal;
    entry.cost += line.unitCost * line.qty;
    soldMap.set(line.menuItemId, entry);
  }

  return items.map((item) => {
    const stats = soldMap.get(item.id) ?? { qty: 0, revenue: 0, cost: 0 };
    return {
      id: item.id,
      name: item.name,
      category: item.category.name,
      price: item.price,
      costPrice: item.costPrice,
      unitProfit: item.price - item.costPrice,
      margin:
        item.price > 0
          ? Math.round(((item.price - item.costPrice) / item.price) * 1000) / 10
          : null,
      available: item.available,
      qtySold: stats.qty,
      revenue: stats.revenue,
      profit: stats.revenue - stats.cost,
    };
  });
}
