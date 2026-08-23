import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";
import { parseMenuItem } from "@/lib/menu-validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiRole(["ADMIN"]);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const data = parseMenuItem(body, { partial: true });

    const existing = await prisma.menuItem.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "That item no longer exists.");

    const item = await prisma.menuItem.update({
      where: { id },
      data,
      include: { category: true },
    });
    return NextResponse.json({ item });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Menu items are never hard-deleted once they have been ordered: past orders
 * keep name and price snapshots, but deleting would still lose the link used
 * for per-item profit reporting. Sold items are archived (marked unavailable)
 * instead, and only never-ordered items are removed outright.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiRole(["ADMIN"]);
    const { id } = await params;

    const item = await prisma.menuItem.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!item) throw new ApiError(404, "That item no longer exists.");

    if (item._count.orderItems > 0) {
      await prisma.menuItem.update({
        where: { id },
        data: { available: false },
      });
      return NextResponse.json({
        archived: true,
        message:
          "This item has been ordered before, so it was hidden from the menu instead of deleted. Its sales history is intact.",
      });
    }

    await prisma.menuItem.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
