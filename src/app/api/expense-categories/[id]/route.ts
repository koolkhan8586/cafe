import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";

const MAX_NAME = 40;

/** PATCH /api/expense-categories/:id — rename, retire, or restore. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiRole(["ADMIN", "MANAGER"]);
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const category = await prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new ApiError(404, "That category no longer exists.");

    const data: { name?: string; active?: boolean } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim().slice(0, MAX_NAME);
      if (!name) throw new ApiError(400, "Enter a category name.");

      const others = await prisma.expenseCategory.findMany({
        where: { NOT: { id } },
        select: { name: true },
      });
      if (others.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        throw new ApiError(409, `"${name}" already exists.`);
      }
      data.name = name;
    }

    if (body.active !== undefined) {
      const active = Boolean(body.active);
      if (!active) {
        // Retiring the last usable category would leave the expense form with
        // nothing to pick, so block it rather than produce a dead screen.
        const remaining = await prisma.expenseCategory.count({
          where: { active: true, NOT: { id } },
        });
        if (remaining === 0) {
          throw new ApiError(409, "This is the only active category.");
        }
      }
      data.active = active;
    }

    const updated = await prisma.expenseCategory.update({ where: { id }, data });
    return NextResponse.json({ category: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * DELETE /api/expense-categories/:id
 *
 * A category that has been used is retired rather than deleted. Expenses store
 * the category name, so deleting would not corrupt them — but it would remove
 * the only record of a name that still appears in past reports.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiRole(["ADMIN", "MANAGER"]);
    const { id } = await params;

    const category = await prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new ApiError(404, "That category no longer exists.");

    const remaining = await prisma.expenseCategory.count({
      where: { active: true, NOT: { id } },
    });
    if (category.active && remaining === 0) {
      throw new ApiError(409, "This is the only active category.");
    }

    const used = await prisma.expense.count({
      where: { category: category.name },
    });

    if (used > 0) {
      const retired = await prisma.expenseCategory.update({
        where: { id },
        data: { active: false },
      });
      return NextResponse.json({
        category: retired,
        retired: true,
        message: `"${category.name}" is used by ${used} expense${used === 1 ? "" : "s"}, so it was retired instead of deleted. Those expenses keep their category.`,
      });
    }

    await prisma.expenseCategory.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
