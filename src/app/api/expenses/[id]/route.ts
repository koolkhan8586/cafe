import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiRole(["ADMIN", "MANAGER"]);
    const { id } = await params;

    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new ApiError(404, "That expense no longer exists.");

    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
