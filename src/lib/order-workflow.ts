import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-auth";
import { notifyEmployeeOfStatus } from "@/lib/waha";
import {
  isOrderStatus,
  STATUS_TRANSITIONS,
  type OrderStatus,
} from "@/lib/types";

const ORDER_INCLUDE = {
  items: true,
  staff: { select: { name: true, code: true, department: true, whatsapp: true } },
} as const;

/**
 * Move an order along the counter workflow. Used by the board PATCH and by
 * WhatsApp ACCEPT / REJECT replies so both paths share the same rules.
 */
export async function applyOrderStatus(id: number, next: OrderStatus) {
  if (!Number.isInteger(id) || id < 1) {
    throw new ApiError(400, "Unknown order.");
  }
  if (!isOrderStatus(next)) throw new ApiError(400, "Unknown status.");

  const order = await prisma.order.findUnique({
    where: { id },
    include: { staff: { select: { name: true, whatsapp: true } } },
  });
  if (!order) throw new ApiError(404, "Order not found.");

  const current = order.status as OrderStatus;
  if (!isOrderStatus(current)) throw new ApiError(500, "Order has a bad status.");

  if (!STATUS_TRANSITIONS[current].includes(next)) {
    throw new ApiError(
      409,
      `An order that is ${current.toLowerCase()} cannot become ${next.toLowerCase()}.`,
    );
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      status: next,
      completedAt: next === "COMPLETED" ? new Date() : order.completedAt,
    },
    include: ORDER_INCLUDE,
  });

  const notification = await notifyEmployeeOfStatus(
    { id: order.id, staff: order.staff },
    next,
  );

  return { order: updated, notification };
}

export async function latestPendingOrderId(): Promise<number | null> {
  const order = await prisma.order.findFirst({
    where: { status: "PENDING" },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return order?.id ?? null;
}
