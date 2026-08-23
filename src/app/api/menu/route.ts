import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";
import { parseMenuItem } from "@/lib/menu-validation";

export async function GET() {
  try {
    await requireApiRole(["ADMIN", "MANAGER"]);
    const items = await prisma.menuItem.findMany({
      include: { category: true },
      orderBy: [
        { category: { sortOrder: "asc" } },
        { sortOrder: "asc" },
        { name: "asc" },
      ],
    });
    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireApiRole(["ADMIN"]);
    const body = (await request.json()) as Record<string, unknown>;
    const data = parseMenuItem(body, { partial: false });

    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) throw new ApiError(400, "That category no longer exists.");

    const item = await prisma.menuItem.create({
      data: {
        name: data.name!,
        description: data.description ?? null,
        price: data.price!,
        costPrice: data.costPrice!,
        categoryId: data.categoryId!,
        available: data.available ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
      include: { category: true },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
