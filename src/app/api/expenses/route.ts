import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";
import { parseMoney } from "@/lib/money";
import { rangeFromParams } from "@/lib/reports";
import { EXPENSE_CATEGORIES } from "@/lib/types";

function parseExpense(body: Record<string, unknown>) {
  const category = String(body.category ?? "").trim();
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
    throw new ApiError(400, "Pick a valid category.");
  }

  const amount = parseMoney(body.amount as string | number);
  if (amount === null || amount <= 0) {
    throw new ApiError(400, "Enter an amount greater than zero.");
  }

  // Date-only input ("2026-10-29") parses as UTC midnight, which can land on
  // the previous day in a positive-offset timezone and put the expense in the
  // wrong month. Build it in local time instead.
  const raw = String(body.spentAt ?? "").trim();
  let spentAt: Date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    spentAt = new Date(y, m - 1, d, 12, 0, 0, 0);
  } else if (raw) {
    spentAt = new Date(raw);
  } else {
    spentAt = new Date();
  }
  if (Number.isNaN(spentAt.getTime())) throw new ApiError(400, "Invalid date.");

  return {
    category,
    amount,
    spentAt,
    note: String(body.note ?? "").trim().slice(0, 300) || null,
  };
}

/** GET /api/expenses?from=&to= */
export async function GET(request: Request) {
  try {
    await requireApiRole(["ADMIN", "MANAGER"]);
    const url = new URL(request.url);
    const range = rangeFromParams(
      url.searchParams.get("from") ?? undefined,
      url.searchParams.get("to") ?? undefined,
    );

    const expenses = await prisma.expense.findMany({
      where: { spentAt: { gte: range.from, lte: range.to } },
      include: { createdBy: { select: { name: true } } },
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({
      expenses,
      total: expenses.reduce((sum, e) => sum + e.amount, 0),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole(["ADMIN", "MANAGER"]);
    const body = (await request.json()) as Record<string, unknown>;
    const data = parseExpense(body);

    const expense = await prisma.expense.create({
      data: { ...data, createdById: user.sub },
      include: { createdBy: { select: { name: true } } },
    });

    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
