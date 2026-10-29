import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";
import { listStaffBalances } from "@/lib/ledger";
import { parseMoney } from "@/lib/money";
import { isLedgerType } from "@/lib/types";

/** GET /api/ledger — every staff account with its current balance. */
export async function GET() {
  try {
    await requireApiRole(["ADMIN", "MANAGER"]);
    return NextResponse.json({ balances: await listStaffBalances() });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * POST /api/ledger — record a payment or an adjustment against an account.
 * Charges are never created here: they come from placing a credit order, so
 * that every charge is traceable to something the person actually ordered.
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiRole(["ADMIN", "MANAGER"]);
    const body = (await request.json()) as Record<string, unknown>;

    const staffId = String(body.staffId ?? "").trim();
    if (!staffId) throw new ApiError(400, "Pick whose account this is for.");

    const type = String(body.type ?? "PAYMENT").toUpperCase();
    if (!isLedgerType(type)) throw new ApiError(400, "Unknown entry type.");
    if (type === "CHARGE") {
      throw new ApiError(
        400,
        "Charges come from placing a credit order, not from the ledger screen.",
      );
    }

    const amount = parseMoney(body.amount as string | number);
    if (amount === null || amount === 0) {
      throw new ApiError(400, "Enter an amount.");
    }
    // A payment only ever reduces the balance, so it is always positive.
    // An adjustment is the one entry that may be negative, to write off part
    // of what someone owes; the sign is stored as given and summed directly.
    if (type === "PAYMENT" && amount < 0) {
      throw new ApiError(
        400,
        "A payment cannot be negative. Use an adjustment to write an amount off.",
      );
    }

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new ApiError(404, "That person no longer exists.");

    const entry = await prisma.ledgerEntry.create({
      data: {
        staffId,
        type,
        amount,
        note: String(body.note ?? "").trim().slice(0, 300) || null,
        createdById: user.sub,
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
