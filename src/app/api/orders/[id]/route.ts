import { NextResponse } from "next/server";
import { ApiError, handleApiError, requireApiRole } from "@/lib/api-auth";
import { applyOrderStatus } from "@/lib/order-workflow";
import { isOrderStatus } from "@/lib/types";

/** PATCH /api/orders/:id — move an order along the counter workflow. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiRole(["ADMIN"]);

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isInteger(id)) throw new ApiError(400, "Unknown order.");

    let body: { status?: unknown };
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid request.");
    }

    const next = String(body.status ?? "").toUpperCase();
    if (!isOrderStatus(next)) throw new ApiError(400, "Unknown status.");

    const result = await applyOrderStatus(id, next);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
