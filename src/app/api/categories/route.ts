import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";

export async function GET() {
  try {
    await requireApiRole(["ADMIN", "MANAGER"]);
    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ categories });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireApiRole(["ADMIN"]);
    const body = (await request.json()) as { name?: unknown };
    const name = String(body.name ?? "").trim();
    if (!name) throw new ApiError(400, "The category needs a name.");

    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) throw new ApiError(409, "That category already exists.");

    const count = await prisma.category.count();
    const category = await prisma.category.create({
      data: { name: name.slice(0, 60), sortOrder: count },
    });
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
