import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";
import { notifyEmployeeOfStatus } from "@/lib/waha";
import {
  isOrderStatus,
  STATUS_TRANSITIONS,
  type OrderStatus,
} from "@/lib/types";

/** PATCH /api/orders/:id — move an order along the counter workflow. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiRole(["ADMIN"]);

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isInteger(id)) throw new ApiError(400, "Unknown order.");

    let body: { status?: unknown };
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid request.");
    }

    const next = String(body.status ?? "").toUpperCase();
    if (!isOrderStatus(next)) throw new ApiError(400, "Unknown status.");

    const order = await prisma.order.findUnique({
      where: { id },
      include: { staff: { select: { name: true, whatsapp: true } } },
    });
    if (!order) throw new ApiError(404, "Order not found.");

    const current = order.status as OrderStatus;
    if (!isOrderStatus(current)) throw new ApiError(500, "Order has a bad status.");

    // Guard the workflow so a completed or cancelled order cannot be reopened
    // and revenue figures cannot be quietly rewritten.
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
      include: {
        items: true,
        staff: { select: { name: true, code: true, department: true } },
      },
    });

    const notification = await notifyEmployeeOfStatus(
      { id: order.id, staff: order.staff },
      next,
    );

    return NextResponse.json({ order: updated, notification });
  } catch (error) {
    return handleApiError(error);
  }
}
