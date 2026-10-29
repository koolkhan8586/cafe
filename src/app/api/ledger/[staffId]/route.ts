import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";
import { getStatement } from "@/lib/ledger";

/** GET /api/ledger/:staffId — one person's statement. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ staffId: string }> },
) {
  try {
    const user = await requireApiRole(["EMPLOYEE", "ADMIN", "MANAGER"]);
    const { staffId } = await params;

    // An employee may read their own statement, nobody else's.
    if (user.role === "EMPLOYEE" && staffId !== user.sub) {
      throw new ApiError(403, "You can only view your own account.");
    }

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { id: true, code: true, name: true, department: true },
    });
    if (!staff) throw new ApiError(404, "That person no longer exists.");

    const lines = await getStatement(staffId);
    const balance = lines.length ? lines[lines.length - 1].runningBalance : 0;

    return NextResponse.json({ staff, lines, balance });
  } catch (error) {
    return handleApiError(error);
  }
}
