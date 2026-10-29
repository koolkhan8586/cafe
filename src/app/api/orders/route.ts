import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";
import { notifyAdminOfOrder } from "@/lib/waha";
import {
  isOrderStatus,
  isPaymentMethod,
  isSettledMethod,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/types";

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

    let body: {
      items?: unknown;
      notes?: unknown;
      paymentMethod?: unknown;
      staffId?: unknown;
      customerName?: unknown;
    };
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

    // Who the order is FOR. An admin or manager may ring one up on behalf of
    // another staff member, or for a walk-in who has no account at all.
    const canActForOthers = user.role === "ADMIN" || user.role === "MANAGER";
    const requestedStaffId =
      typeof body.staffId === "string" ? body.staffId.trim() : "";
    const customerName =
      typeof body.customerName === "string"
        ? body.customerName.trim().slice(0, 120)
        : "";

    if ((requestedStaffId || customerName) && !canActForOthers) {
      throw new ApiError(403, "Only an admin or manager can order for someone else.");
    }
    if (requestedStaffId && customerName) {
      throw new ApiError(400, "Pick a staff member or a walk-in name, not both.");
    }

    const isManual = canActForOthers && Boolean(requestedStaffId || customerName);

    // For a walk-in the order still hangs off the person who rang it up, so
    // the required Order.staffId relation always points at a real account.
    const ownerId = requestedStaffId || user.sub;
    const staff = await prisma.staff.findUnique({ where: { id: ownerId } });
    if (!staff) throw new ApiError(404, "That staff member no longer exists.");
    if (!staff.active) {
      throw new ApiError(
        403,
        requestedStaffId ? `${staff.name}'s account is inactive.` : "Your account is inactive.",
      );
    }

    let paymentMethod: PaymentMethod = "CASH";
    if (body.paymentMethod !== undefined) {
      if (!isPaymentMethod(body.paymentMethod)) {
        throw new ApiError(400, "Payment must be cash, JazzCash or credit.");
      }
      paymentMethod = body.paymentMethod;
    }

    // A walk-in has no account to charge, so credit is meaningless for them.
    if (customerName && !isSettledMethod(paymentMethod)) {
      throw new ApiError(
        400,
        "A walk-in order cannot go on credit — there is no account to charge.",
      );
    }

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

    // The order and its ledger charge must land together: a credit order whose
    // charge failed to post would be free, and a charge without an order would
    // be unexplainable on the statement.
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          staffId: staff.id,
          status: "PENDING",
          notes: orderNotes || null,
          department: customerName ? null : staff.department,
          subtotal,
          totalCost,
          paymentMethod,
          isManual,
          placedById: isManual ? user.sub : null,
          customerName: customerName || null,
          items: { create: orderItems },
        },
        include: {
          items: true,
          staff: { select: { name: true, code: true, department: true } },
        },
      });

      if (!isSettledMethod(paymentMethod)) {
        await tx.ledgerEntry.create({
          data: {
            staffId: staff.id,
            type: "CHARGE",
            amount: subtotal,
            orderId: created.id,
            note: `Order #${created.id}`,
            createdById: isManual ? user.sub : null,
          },
        });
      }

      return created;
    });

    // WhatsApp is best-effort: a WAHA outage must not lose the order. The
    // result is surfaced so the UI can warn the employee if it did not go out.
    const notification = await notifyAdminOfOrder(order);

    return NextResponse.json({ order, notification }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
