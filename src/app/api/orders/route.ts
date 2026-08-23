import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";
import { notifyAdminOfOrder } from "@/lib/waha";
import { isOrderStatus, type OrderStatus } from "@/lib/types";

const MAX_QTY_PER_LINE = 50;

type IncomingLine = { menuItemId: string; qty: number; notes?: string };

function parseLines(raw: unknown): IncomingLine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError(400, "Your cart is empty.");
  }
  return raw.map((entry) => {
    const line = entry as Record<string, unknown>;
    const menuItemId = typeof line.menuItemId === "string" ? line.menuItemId : "";
    const qty = Number(line.qty);
    if (!menuItemId) throw new ApiError(400, "A cart line is missing its item.");
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw new ApiError(400, `Quantities must be between 1 and ${MAX_QTY_PER_LINE}.`);
    }
    const notes = typeof line.notes === "string" ? line.notes.trim().slice(0, 200) : "";
    return { menuItemId, qty, notes: notes || undefined };
  });
}

/** GET /api/orders — the caller's own orders. Admins see the whole board. */
export async function GET(request: Request) {
  try {
    const user = await requireApiRole(["EMPLOYEE", "ADMIN", "MANAGER"]);
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const statusParam = url.searchParams.get("status");

    // Only an admin may look at other people's orders.
    const seeAll = scope === "all" && user.role === "ADMIN";

    const statuses = (statusParam ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is OrderStatus => isOrderStatus(s));

    const orders = await prisma.order.findMany({
      where: {
        ...(seeAll ? {} : { staffId: user.sub }),
        ...(statuses.length ? { status: { in: statuses } } : {}),
      },
      include: {
        items: true,
        staff: { select: { name: true, code: true, department: true } },
      },
      orderBy: { createdAt: "desc" },
      take: seeAll ? 200 : 50,
    });

    return NextResponse.json({ orders });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/orders — place an order. */
export async function POST(request: Request) {
  try {
    const user = await requireApiRole(["EMPLOYEE", "ADMIN", "MANAGER"]);

    let body: { items?: unknown; notes?: unknown };
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid request.");
    }

    const lines = parseLines(body.items);
    const orderNotes =
      typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";

    // Prices and costs come from the database, never from the client, so a
    // tampered request cannot buy a biryani for one rupee.
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: lines.map((l) => l.menuItemId) } },
    });
    const byId = new Map(menuItems.map((item) => [item.id, item]));

    const unavailable = lines.filter((line) => {
      const item = byId.get(line.menuItemId);
      return !item || !item.available;
    });
    if (unavailable.length > 0) {
      const names = unavailable
        .map((l) => byId.get(l.menuItemId)?.name ?? "an item")
        .join(", ");
      throw new ApiError(
        409,
        `No longer available: ${names}. Remove it and try again.`,
      );
    }

    const staff = await prisma.staff.findUnique({ where: { id: user.sub } });
    if (!staff || !staff.active) throw new ApiError(403, "Your account is inactive.");

    const orderItems = lines.map((line) => {
      const item = byId.get(line.menuItemId)!;
      return {
        menuItemId: item.id,
        nameSnapshot: item.name,
        unitPrice: item.price,
        unitCost: item.costPrice,
        qty: line.qty,
        lineTotal: item.price * line.qty,
        notes: line.notes ?? null,
      };
    });

    const subtotal = orderItems.reduce((sum, i) => sum + i.lineTotal, 0);
    const totalCost = orderItems.reduce((sum, i) => sum + i.unitCost * i.qty, 0);

    const order = await prisma.order.create({
      data: {
        staffId: staff.id,
        status: "PENDING",
        notes: orderNotes || null,
        department: staff.department,
        subtotal,
        totalCost,
        items: { create: orderItems },
      },
      include: {
        items: true,
        staff: { select: { name: true, code: true, department: true } },
      },
    });

    // WhatsApp is best-effort: a WAHA outage must not lose the order. The
    // result is surfaced so the UI can warn the employee if it did not go out.
    const notification = await notifyAdminOfOrder(order);

    return NextResponse.json({ order, notification }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
