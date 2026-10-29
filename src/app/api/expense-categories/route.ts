import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";

const MAX_NAME = 40;

/** GET /api/expense-categories — active first, in display order. */
export async function GET() {
  try {
    await requireApiRole(["ADMIN", "MANAGER"]);
    const categories = await prisma.expenseCategory.findMany({
      orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ categories });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireApiRole(["ADMIN", "MANAGER"]);
    const body = (await request.json()) as { name?: unknown };

    const name = String(body.name ?? "").trim().slice(0, MAX_NAME);
    if (!name) throw new ApiError(400, "Enter a category name.");

    // Compared case-insensitively so "Gas" and "gas" cannot both exist and
    // split the same spending across two rows in the report. Done in JS
    // because SQLite does not support Prisma's `mode: "insensitive"`, which
    // would silently fall back to a case-sensitive match.
    const existing = await prisma.expenseCategory.findMany({
      select: { name: true, active: true },
    });
    const clash = existing.find(
      (c) => c.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) {
      throw new ApiError(
        409,
        clash.active
          ? `"${clash.name}" already exists.`
          : `"${clash.name}" exists but is retired. Restore it instead.`,
      );
    }

    const count = await prisma.expenseCategory.count();
    const category = await prisma.expenseCategory.create({
      data: { name, sortOrder: count },
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
